import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OrderItemRow, OrderRow } from "@/lib/types";

const { sendOrderConfirmationEmail, sendAdminNewOrderEmail } = vi.hoisted(() => ({
  sendOrderConfirmationEmail: vi.fn(async () => {}),
  sendAdminNewOrderEmail: vi.fn(async () => {}),
}));

vi.mock("@/lib/email", () => ({ sendOrderConfirmationEmail, sendAdminNewOrderEmail }));

import { finalizeOrderPayment } from "@/lib/order-finalization";

const order: OrderRow = {
  id: "order-1",
  customer_name: "Ana",
  customer_email: "ana@example.com",
  address_line: "Calle 1",
  city: "Distrito Nacional",
  country_code: "DO",
  shipping_zone_id: "z1",
  status: "paid",
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
  { id: "i1", order_id: "order-1", variant_id: "v1", quantity: 2, unit_price_cents: 2500 },
  { id: "i2", order_id: "order-1", variant_id: "v2", quantity: 1, unit_price_cents: 1000 },
];

function createSupabaseStub() {
  const rpcCalls: { name: string; args: unknown }[] = [];
  return {
    client: {
      rpc: async (name: string, args: unknown) => {
        rpcCalls.push({ name, args });
        return { error: null };
      },
    },
    rpcCalls,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("finalizeOrderPayment", () => {
  it("decrements stock once per order line", async () => {
    const stub = createSupabaseStub();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await finalizeOrderPayment(stub.client as any, order, items);
    expect(stub.rpcCalls).toEqual([
      { name: "decrement_variant_stock", args: { p_variant_id: "v1", p_quantity: 2 } },
      { name: "decrement_variant_stock", args: { p_variant_id: "v2", p_quantity: 1 } },
    ]);
  });

  it("sends the customer confirmation and admin notification emails", async () => {
    const stub = createSupabaseStub();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await finalizeOrderPayment(stub.client as any, order, items);
    expect(sendOrderConfirmationEmail).toHaveBeenCalledWith(order);
    expect(sendAdminNewOrderEmail).toHaveBeenCalledWith(order);
  });

  it("logs but does not throw when a stock decrement fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = { rpc: async () => ({ error: new Error("boom") }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(finalizeOrderPayment(client as any, order, items)).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
