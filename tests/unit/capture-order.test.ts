import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import type { NextRequest } from "next/server";
import type { OrderItemRow, OrderRow, OrderStatus } from "@/lib/types";

const {
  capturePayPalOrder,
  sendOrderConfirmationEmail,
  sendAdminNewOrderEmail,
  sendAdminPaymentIssueEmail,
  createAdminSupabaseClient,
} = vi.hoisted(() => ({
  capturePayPalOrder: vi.fn(),
  sendOrderConfirmationEmail: vi.fn(async () => {}),
  sendAdminNewOrderEmail: vi.fn(async () => {}),
  sendAdminPaymentIssueEmail: vi.fn(async () => {}),
  createAdminSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/paypal", () => ({ capturePayPalOrder }));
vi.mock("@/lib/email", () => ({
  sendOrderConfirmationEmail,
  sendAdminNewOrderEmail,
  sendAdminPaymentIssueEmail,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient }));

import { POST } from "@/app/api/paypal/capture-order/route";

const order: OrderRow = {
  id: "order-1",
  customer_name: "Ana",
  customer_email: "ana@example.com",
  address_line: "Calle 1",
  city: "Bogota",
  country_code: "CO",
  shipping_zone_id: "z1",
  status: "pending",
  subtotal_cents: 5000,
  shipping_cents: 500,
  total_cents: 5500,
  locale: "es",
  tracking_number: null,
  paypal_order_id: "pp-1",
  created_at: "2026-01-01T00:00:00Z",
};

const items: OrderItemRow[] = [
  { id: "i1", order_id: "order-1", variant_id: "v1", quantity: 2, unit_price_cents: 2500 },
];

type Result = { data: unknown; error: unknown };

/**
 * Minimal stand-in for the chained PostgREST builder the route uses:
 * `.from(t).select().eq().maybeSingle()`, `.from(t).select().eq()` (awaited
 * directly) and `.from("orders").update().eq().eq().select().maybeSingle()`.
 */
function createSupabaseStub(results: { order: Result; items?: Result; update?: Result }) {
  const updates: unknown[] = [];
  const rpcCalls: { name: string; args: unknown }[] = [];

  function resolve(ctx: { table: string; op: "select" | "update" }): Result {
    if (ctx.table === "orders" && ctx.op === "update") {
      return results.update ?? { data: null, error: null };
    }
    if (ctx.table === "orders") return results.order;
    if (ctx.table === "order_items") return results.items ?? { data: [], error: null };
    throw new Error(`unexpected table ${ctx.table}`);
  }

  const client = {
    from(table: string) {
      const ctx: { table: string; op: "select" | "update" } = { table, op: "select" };
      const chain = {
        select: () => chain,
        eq: () => chain,
        update: (payload: unknown) => {
          ctx.op = "update";
          updates.push(payload);
          return chain;
        },
        maybeSingle: async () => resolve(ctx),
        then: (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) =>
          Promise.resolve(resolve(ctx)).then(onOk, onErr),
      };
      return chain;
    },
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return { error: null };
    },
  };

  return { client, updates, rpcCalls };
}

function post(body: unknown) {
  return POST({ json: async () => body } as NextRequest);
}

function completedCapture(value: string) {
  return {
    status: "COMPLETED",
    purchase_units: [{ payments: { captures: [{ amount: { value } }] } }],
  };
}

const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  consoleError.mockRestore();
});

describe("capture-order status transitions", () => {
  const cases: {
    name: string;
    status: OrderStatus;
    capture: unknown;
    expectedStatus: number;
    expectedBody: unknown;
    expectPaidUpdate: boolean;
    expectEmails: boolean;
    expectAlert: boolean;
  }[] = [
    {
      name: "pending order with a matching capture becomes paid",
      status: "pending",
      capture: completedCapture("55.00"),
      expectedStatus: 200,
      expectedBody: { orderId: "order-1" },
      expectPaidUpdate: true,
      expectEmails: true,
      expectAlert: false,
    },
    {
      name: "a short capture is rejected with 409 amount_mismatch and never marked paid",
      status: "pending",
      capture: completedCapture("1.00"),
      expectedStatus: 409,
      expectedBody: { error: "amount_mismatch" },
      expectPaidUpdate: false,
      expectEmails: false,
      expectAlert: true,
    },
    {
      name: "an over-capture is rejected too",
      status: "pending",
      capture: completedCapture("550.00"),
      expectedStatus: 409,
      expectedBody: { error: "amount_mismatch" },
      expectPaidUpdate: false,
      expectEmails: false,
      expectAlert: true,
    },
    {
      name: "a non-completed capture is rejected with 400 payment_not_completed",
      status: "pending",
      capture: { status: "DECLINED" },
      expectedStatus: 400,
      expectedBody: { error: "payment_not_completed" },
      expectPaidUpdate: false,
      expectEmails: false,
      expectAlert: true,
    },
    {
      name: "an already-paid order is an idempotent no-op",
      status: "paid",
      capture: completedCapture("55.00"),
      expectedStatus: 200,
      expectedBody: { orderId: "order-1" },
      expectPaidUpdate: false,
      expectEmails: false,
      expectAlert: false,
    },
    {
      name: "a shipped order is refused rather than re-captured",
      status: "shipped",
      capture: completedCapture("55.00"),
      expectedStatus: 409,
      expectedBody: { error: "invalid_order_status" },
      expectPaidUpdate: false,
      expectEmails: false,
      expectAlert: false,
    },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      const stub = createSupabaseStub({
        order: { data: { ...order, status: c.status }, error: null },
        items: { data: items, error: null },
        update: { data: { ...order, status: "paid" }, error: null },
      });
      createAdminSupabaseClient.mockReturnValue(stub.client);
      capturePayPalOrder.mockResolvedValue(c.capture);

      const res = await post({ paypalOrderId: "pp-1" });

      expect(res.status).toBe(c.expectedStatus);
      expect(await res.json()).toEqual(c.expectedBody);
      expect(stub.updates).toEqual(c.expectPaidUpdate ? [{ status: "paid" }] : []);
      expect(sendOrderConfirmationEmail).toHaveBeenCalledTimes(c.expectEmails ? 1 : 0);
      expect(sendAdminNewOrderEmail).toHaveBeenCalledTimes(c.expectEmails ? 1 : 0);
      expect(sendAdminPaymentIssueEmail).toHaveBeenCalledTimes(c.expectAlert ? 1 : 0);
      expect(stub.rpcCalls).toHaveLength(c.expectPaidUpdate ? items.length : 0);
      if (c.expectAlert) {
        expect(consoleError).toHaveBeenCalled();
      }
    });
  }

  it("decrements stock once per line only after the compare-and-swap wins", async () => {
    const stub = createSupabaseStub({
      order: { data: order, error: null },
      items: { data: items, error: null },
      update: { data: { ...order, status: "paid" }, error: null },
    });
    createAdminSupabaseClient.mockReturnValue(stub.client);
    capturePayPalOrder.mockResolvedValue(completedCapture("55.00"));

    await post({ paypalOrderId: "pp-1" });

    expect(stub.rpcCalls).toEqual([
      { name: "decrement_variant_stock", args: { p_variant_id: "v1", p_quantity: 2 } },
    ]);
  });

  it("treats a lost compare-and-swap race as success without double-fulfilling", async () => {
    const stub = createSupabaseStub({
      order: { data: order, error: null },
      items: { data: items, error: null },
      // Another request already flipped pending -> paid, so no row matches.
      update: { data: null, error: null },
    });
    createAdminSupabaseClient.mockReturnValue(stub.client);
    capturePayPalOrder.mockResolvedValue(completedCapture("55.00"));

    const res = await post({ paypalOrderId: "pp-1" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orderId: "order-1" });
    expect(stub.rpcCalls).toHaveLength(0);
    expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
  });

  it("404s an unknown PayPal order without capturing anything", async () => {
    const stub = createSupabaseStub({ order: { data: null, error: null } });
    createAdminSupabaseClient.mockReturnValue(stub.client);

    const res = await post({ paypalOrderId: "pp-unknown" });

    expect(res.status).toBe(404);
    expect(capturePayPalOrder).not.toHaveBeenCalled();
  });

  it("rejects a request with no PayPal order id", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_paypal_order_id" });
  });
});
