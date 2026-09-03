import { describe, it, expect, vi } from "vitest";
import { buildOrderRecord } from "@/lib/paypal";

describe("buildOrderRecord", () => {
  it("computes subtotal, shipping, and total from variants and zone", () => {
    const record = buildOrderRecord({
      items: [{ variantId: "v1", quantity: 2 }],
      variants: [{ id: "v1", price_cents: 1000, stock: 5 }],
      zone: { id: "z1", rateCents: 500 },
      customer: {
        name: "Ana",
        email: "ana@example.com",
        address: "Calle 1",
        city: "Bogota",
        countryCode: "CO",
      },
      locale: "es",
      paypalOrderId: "order-123",
    });

    expect(record.order.subtotal_cents).toBe(2000);
    expect(record.order.shipping_cents).toBe(500);
    expect(record.order.total_cents).toBe(2500);
    expect(record.items[0]).toMatchObject({ variant_id: "v1", quantity: 2, unit_price_cents: 1000 });
  });
});
