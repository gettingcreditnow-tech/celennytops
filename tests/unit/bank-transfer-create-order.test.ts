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

function createSupabaseStub(opts: {
  variants: Result;
  zones: Result;
  upload?: { error: unknown };
  orderInsert?: Result;
  itemsInsert?: { error: unknown };
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
      if (table === "orders") {
        return {
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
    overrides.proof === undefined ? new File(["x"], "proof.jpg", { type: "image/jpeg" }) : overrides.proof;
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
});
