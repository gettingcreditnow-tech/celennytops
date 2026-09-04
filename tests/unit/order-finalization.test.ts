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

const variants = [
  { id: "v1", size: "0-3 meses", color: "Rosa", products: { name_es: "Producto A", name_en: "Product A", images: ["/img-a.jpg"] } },
  { id: "v2", size: "M", color: "Azul", products: { name_es: "Producto B", name_en: "Product B", images: ["/img-b.jpg"] } },
];

const expectedConfirmationItems = [
  { quantity: 2, unitPriceCents: 2500, size: "0-3 meses", color: "Rosa", productNameEs: "Producto A", productNameEn: "Product A", image: "/img-a.jpg" },
  { quantity: 1, unitPriceCents: 1000, size: "M", color: "Azul", productNameEs: "Producto B", productNameEn: "Product B", image: "/img-b.jpg" },
];

function createSupabaseStub(opts: { variants?: { data: unknown; error: unknown } } = {}) {
  const rpcCalls: { name: string; args: unknown }[] = [];
  return {
    client: {
      rpc: async (name: string, args: unknown) => {
        rpcCalls.push({ name, args });
        return { error: null };
      },
      from: (table: string) => {
        if (table === "product_variants") {
          return { select: () => ({ in: async () => opts.variants ?? { data: [], error: null } }) };
        }
        throw new Error(`unexpected table ${table}`);
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

  it("sends the customer confirmation with item photos/details but not a second admin email for bank-transfer orders", async () => {
    const stub = createSupabaseStub({ variants: { data: variants, error: null } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await finalizeOrderPayment(stub.client as any, order, items);
    expect(sendOrderConfirmationEmail).toHaveBeenCalledWith(order, expectedConfirmationItems);
    expect(sendAdminNewOrderEmail).not.toHaveBeenCalled();
  });

  it("sends both the customer confirmation and admin notification for PayPal orders", async () => {
    const stub = createSupabaseStub({ variants: { data: variants, error: null } });
    const paypalOrder = { ...order, payment_method: "paypal" as const };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await finalizeOrderPayment(stub.client as any, paypalOrder, items);
    expect(sendOrderConfirmationEmail).toHaveBeenCalledWith(paypalOrder, expectedConfirmationItems);
    expect(sendAdminNewOrderEmail).toHaveBeenCalledWith(paypalOrder);
  });

  it("falls back to an empty item list (still sends the email) when the product lookup fails", async () => {
    const stub = createSupabaseStub({ variants: { data: null, error: new Error("boom") } });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await finalizeOrderPayment(stub.client as any, order, items);
    expect(sendOrderConfirmationEmail).toHaveBeenCalledWith(order, []);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
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
