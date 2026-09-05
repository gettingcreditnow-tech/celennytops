import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { createAdminSupabaseClient, createPayPalOrder } = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
  createPayPalOrder: vi.fn(async () => ({ id: "pp-order-1" })),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient }));
vi.mock("@/lib/paypal", () => ({ createPayPalOrder }));

import { POST } from "@/app/api/paypal/create-order/route";

type Result = { data: unknown; error: unknown };

const variants = [{ id: "v1", price_cents: 1200, stock: 5 }];
const zones = [{ id: "z1", name: "Pais local", country_codes: ["CO"], sector: null, rate_cents: 500 }];

function createSupabaseStub(opts: {
  settings?: Result;
  candidates?: Result;
  orderInsert?: Result;
  itemsInsert?: { error: unknown };
}) {
  const inserts: { table: string; payload: unknown }[] = [];
  const client = {
    from(table: string) {
      if (table === "product_variants") {
        return { select: () => ({ in: async () => ({ data: variants, error: null }) }) };
      }
      if (table === "shipping_zones") {
        return { select: async () => ({ data: zones, error: null }) };
      }
      if (table === "store_settings") {
        return {
          select: () => ({
            maybeSingle: async () => opts.settings ?? { data: { free_shipping_min_quantity: 2 }, error: null },
          }),
        };
      }
      if (table === "orders") {
        const reuseChain: {
          eq: () => typeof reuseChain;
          gte: () => typeof reuseChain;
          order: () => typeof reuseChain;
          limit: () => Promise<Result>;
        } = {
          eq: () => reuseChain,
          gte: () => reuseChain,
          order: () => reuseChain,
          limit: async () => opts.candidates ?? { data: [], error: null },
        };
        return {
          select: () => reuseChain,
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
  };
  return { client, inserts };
}

function post(body: unknown) {
  return POST({ json: async () => body } as NextRequest);
}

const customer = {
  name: "Ana",
  email: "ana@example.com",
  phone: "8095551234",
  address: "Calle 1",
  city: "Bogota",
  countryCode: "CO",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/paypal/create-order customer validation", () => {
  it("rejects a request with no phone number", async () => {
    const stub = createSupabaseStub({});
    createAdminSupabaseClient.mockReturnValue(stub.client);

    const { phone, ...customerWithoutPhone } = customer;
    const res = await post({ items: [{ variantId: "v1", quantity: 1 }], customer: customerWithoutPhone, locale: "es" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_customer" });
    void phone;
  });
});

describe("POST /api/paypal/create-order free shipping", () => {
  it("charges the normal shipping rate when cart quantity is below the threshold", async () => {
    const stub = createSupabaseStub({ orderInsert: { data: { id: "order-1" }, error: null } });
    createAdminSupabaseClient.mockReturnValue(stub.client);

    const res = await post({ items: [{ variantId: "v1", quantity: 1 }], customer, locale: "es" });

    expect(res.status).toBe(200);
    expect(createPayPalOrder).toHaveBeenCalledWith(1700, "USD");
    const orderInsert = stub.inserts.find((i) => i.table === "orders");
    expect(orderInsert?.payload).toMatchObject({ shipping_cents: 500, total_cents: 1700 });
  });

  it("zeroes shipping and charges PayPal only the subtotal once quantity meets the threshold", async () => {
    const stub = createSupabaseStub({ orderInsert: { data: { id: "order-2" }, error: null } });
    createAdminSupabaseClient.mockReturnValue(stub.client);

    const res = await post({ items: [{ variantId: "v1", quantity: 2 }], customer, locale: "es" });

    expect(res.status).toBe(200);
    expect(createPayPalOrder).toHaveBeenCalledWith(2400, "USD");
    const orderInsert = stub.inserts.find((i) => i.table === "orders");
    expect(orderInsert?.payload).toMatchObject({ shipping_cents: 0, total_cents: 2400 });
  });
});
