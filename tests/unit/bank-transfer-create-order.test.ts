import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { createAdminSupabaseClient, sendAdminNewOrderEmail } = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
  sendAdminNewOrderEmail: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient }));
vi.mock("@/lib/email", () => ({ sendAdminNewOrderEmail }));

import { POST } from "@/app/api/bank-transfer/create-order/route";

type Result = { data: unknown; error: unknown };

const variants = [{ id: "v1", price_cents: 2500, stock: 3 }];
const zones = [
  { id: "z1", name: "Distrito Nacional", country_codes: ["DO"], sector: "Distrito Nacional", rate_cents: 500 },
];

// Minimal valid JPEG bytes (SOI + APP0 marker) so the route's magic-byte
// check accepts it - a plain string like "x" is not a real JPEG and would
// now be correctly rejected as invalid_proof_type.
const VALID_JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);

function createSupabaseStub(opts: {
  variants: Result;
  zones: Result;
  settings?: Result;
  upload?: { error: unknown };
  orderInsert?: Result;
  itemsInsert?: { error: unknown };
  duplicates?: Result;
}) {
  const uploads: { path: string }[] = [];
  const inserts: { table: string; payload: unknown }[] = [];
  const client = {
    from(table: string) {
      if (table === "product_variants") {
        return { select: () => ({ in: async () => opts.variants }) };
      }
      if (table === "shipping_zones") {
        return { select: async () => opts.zones };
      }
      if (table === "store_settings") {
        return {
          select: () => ({
            maybeSingle: async () => opts.settings ?? { data: { free_shipping_min_quantity: 2 }, error: null },
          }),
        };
      }
      if (table === "orders") {
        const duplicateChain: {
          eq: () => typeof duplicateChain;
          gte: () => typeof duplicateChain;
          limit: () => Promise<Result>;
        } = {
          eq: () => duplicateChain,
          gte: () => duplicateChain,
          limit: async () => opts.duplicates ?? { data: [], error: null },
        };
        return {
          select: () => duplicateChain,
          insert: (payload: unknown) => {
            inserts.push({ table, payload });
            return {
              select: () => ({
                single: async () => opts.orderInsert ?? { data: null, error: null },
              }),
            };
          },
        };
      }
      if (table === "order_items") {
        return {
          insert: async (payload: unknown) => {
            inserts.push({ table, payload });
            return opts.itemsInsert ?? { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from: (_bucket: string) => ({
        upload: async (path: string) => {
          uploads.push({ path });
          return opts.upload ?? { error: null };
        },
      }),
    },
  };
  return { client, uploads, inserts };
}

function buildForm(
  overrides: Partial<{
    items: unknown;
    customer: unknown;
    locale: string;
    proof: File | null;
  }> = {}
) {
  const form = new FormData();
  form.set("items", JSON.stringify(overrides.items ?? [{ variantId: "v1", quantity: 1 }]));
  form.set(
    "customer",
    JSON.stringify(
      overrides.customer ?? {
        name: "Ana",
        email: "ana@example.com",
        address: "Calle 1",
        city: "Distrito Nacional",
        countryCode: "DO",
      }
    )
  );
  form.set("locale", overrides.locale ?? "es");
  const proof =
    overrides.proof === undefined
      ? new File([VALID_JPEG_BYTES], "proof.jpg", { type: "image/jpeg" })
      : overrides.proof;
  if (proof) form.set("proof", proof);
  return form;
}

function post(form: FormData) {
  return POST({ formData: async () => form } as unknown as NextRequest);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/bank-transfer/create-order", () => {
  it("creates a pending bank-transfer order and uploads the proof", async () => {
    const stub = createSupabaseStub({
      variants: { data: variants, error: null },
      zones: { data: zones, error: null },
      orderInsert: { data: { id: "order-1", customer_name: "Ana", total_cents: 3000 }, error: null },
    });
    createAdminSupabaseClient.mockReturnValue(stub.client);

    const res = await post(buildForm());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orderId: "order-1" });
    expect(stub.uploads).toHaveLength(1);
    expect(stub.uploads[0].path).toMatch(/^bank-transfer\/.+\.jpg$/);
    const orderInsert = stub.inserts.find((i) => i.table === "orders");
    expect(orderInsert?.payload).toMatchObject({
      status: "pending",
      payment_method: "bank_transfer",
      total_cents: 3000,
    });
    expect(sendAdminNewOrderEmail).toHaveBeenCalledTimes(1);
  });

  it("rejects a country other than DO", async () => {
    const res = await post(
      buildForm({ customer: { name: "A", email: "a@b.com", address: "x", city: "x", countryCode: "US" } })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unsupported_country" });
  });

  it("rejects a request with no proof file", async () => {
    const res = await post(buildForm({ proof: null }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_proof" });
  });

  it("rejects a non-image proof file", async () => {
    const res = await post(buildForm({ proof: new File(["x"], "proof.pdf", { type: "application/pdf" }) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_proof_type" });
  });

  it("rejects a proof file whose content doesn't match its declared image type", async () => {
    const res = await post(
      buildForm({ proof: new File(["not actually a jpeg"], "proof.jpg", { type: "image/jpeg" }) })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_proof_type" });
  });

  it("rejects a proof file larger than the size limit", async () => {
    const oversized = new Uint8Array(4 * 1024 * 1024 + 1);
    oversized.set(VALID_JPEG_BYTES);
    const res = await post(buildForm({ proof: new File([oversized], "proof.jpg", { type: "image/jpeg" }) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "proof_too_large" });
  });

  it("passes through the insufficient-stock rejection from buildOrderDraft without uploading", async () => {
    const stub = createSupabaseStub({
      variants: { data: [{ id: "v1", price_cents: 2500, stock: 0 }], error: null },
      zones: { data: zones, error: null },
    });
    createAdminSupabaseClient.mockReturnValue(stub.client);

    const res = await post(buildForm());

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "insufficient_stock" });
    expect(stub.uploads).toHaveLength(0);
  });

  it("rejects a duplicate submission within the reuse window without uploading a second proof", async () => {
    const stub = createSupabaseStub({
      variants: { data: variants, error: null },
      zones: { data: zones, error: null },
      duplicates: { data: [{ id: "existing-order" }], error: null },
    });
    createAdminSupabaseClient.mockReturnValue(stub.client);

    const res = await post(buildForm());

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "duplicate_submission" });
    expect(stub.uploads).toHaveLength(0);
    expect(stub.inserts).toHaveLength(0);
  });

  it("zeroes shipping once the cart quantity meets the free-shipping threshold", async () => {
    const stub = createSupabaseStub({
      variants: { data: variants, error: null },
      zones: { data: zones, error: null },
      orderInsert: { data: { id: "order-free-ship", customer_name: "Ana", total_cents: 5000 }, error: null },
    });
    createAdminSupabaseClient.mockReturnValue(stub.client);

    const res = await post(buildForm({ items: [{ variantId: "v1", quantity: 2 }] }));

    expect(res.status).toBe(200);
    const orderInsert = stub.inserts.find((i) => i.table === "orders");
    expect(orderInsert?.payload).toMatchObject({ shipping_cents: 0, total_cents: 5000 });
  });
});
