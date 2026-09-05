import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { OrderItemRow, OrderRow } from "@/lib/types";

const { createServerSupabaseClient, finalizeOrderPayment } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  finalizeOrderPayment: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("@/lib/order-finalization", () => ({ finalizeOrderPayment }));

import { POST } from "@/app/api/admin/orders/[id]/mark-paid/route";

const order: OrderRow = {
  id: "order-1",
  customer_name: "Ana",
  customer_email: "ana@example.com",
  customer_phone: "8095551234",
  address_line: "Calle 1",
  city: "Distrito Nacional",
  country_code: "DO",
  shipping_zone_id: "z1",
  status: "pending",
  subtotal_cents: 5000,
  shipping_cents: 500,
  total_cents: 5500,
  locale: "es",
  tracking_number: null,
  paypal_order_id: null,
  payment_method: "bank_transfer",
  payment_proof_path: "bank-transfer/proof.jpg",
  created_at: "2026-01-01T00:00:00Z",
};

const items: OrderItemRow[] = [
  { id: "i1", order_id: "order-1", variant_id: "v1", quantity: 1, unit_price_cents: 2500 },
];

type Result = { data: unknown; error: unknown };

function createSupabaseStub(opts: {
  authedUser?: { email: string } | null;
  order: Result;
  update?: Result;
  items?: Result;
}) {
  const updates: unknown[] = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: opts.authedUser === undefined ? { email: "admin@celennytops.com" } : opts.authedUser },
      }),
    },
    from(table: string) {
      if (table === "orders") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => opts.order,
            }),
          }),
          update: (payload: unknown) => {
            updates.push(payload);
            return {
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => opts.update ?? { data: null, error: null },
                  }),
                }),
              }),
            };
          },
        };
      }
      if (table === "order_items") {
        return {
          select: () => ({
            eq: async () => opts.items ?? { data: [], error: null },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client, updates };
}

function post(id: string) {
  return POST({} as NextRequest, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/orders/[id]/mark-paid", () => {
  it("flips a pending bank-transfer order to paid and finalizes it", async () => {
    const stub = createSupabaseStub({
      order: { data: order, error: null },
      update: { data: { ...order, status: "paid" }, error: null },
      items: { data: items, error: null },
    });
    createServerSupabaseClient.mockResolvedValue(stub.client);

    const res = await post("order-1");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orderId: "order-1" });
    expect(finalizeOrderPayment).toHaveBeenCalledWith(stub.client, { ...order, status: "paid" }, items);
  });

  it("rejects a PayPal order even if it is pending", async () => {
    const stub = createSupabaseStub({
      order: { data: { ...order, payment_method: "paypal" }, error: null },
    });
    createServerSupabaseClient.mockResolvedValue(stub.client);

    const res = await post("order-1");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "not_bank_transfer" });
    expect(finalizeOrderPayment).not.toHaveBeenCalled();
  });

  it("rejects an already-paid order", async () => {
    const stub = createSupabaseStub({
      order: { data: { ...order, status: "paid" }, error: null },
    });
    createServerSupabaseClient.mockResolvedValue(stub.client);

    const res = await post("order-1");

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "invalid_order_status" });
  });

  it("returns 409 without finalizing when the update affects no row (RLS block or lost race)", async () => {
    const stub = createSupabaseStub({
      order: { data: order, error: null },
      update: { data: null, error: null },
    });
    createServerSupabaseClient.mockResolvedValue(stub.client);

    const res = await post("order-1");

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_updated" });
    expect(finalizeOrderPayment).not.toHaveBeenCalled();
  });

  it("401s when there is no signed-in user", async () => {
    const stub = createSupabaseStub({ authedUser: null, order: { data: order, error: null } });
    createServerSupabaseClient.mockResolvedValue(stub.client);

    const res = await post("order-1");

    expect(res.status).toBe(401);
  });
});
