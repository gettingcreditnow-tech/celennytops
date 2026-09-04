import { describe, it, expect } from "vitest";
import { buildOrderConfirmationEmail, buildPaymentIssueEmail } from "@/lib/email";

describe("buildOrderConfirmationEmail", () => {
  it("builds a Spanish subject and body with the order total", () => {
    const email = buildOrderConfirmationEmail({
      customer_email: "ana@example.com",
      customer_name: "Ana",
      total_cents: 2500,
      locale: "es",
    } as any);
    expect(email.to).toBe("ana@example.com");
    expect(email.subject).toMatch(/pedido/i);
    expect(email.html).toContain("25.00");
  });

  it("builds an English subject when locale is en", () => {
    const email = buildOrderConfirmationEmail({
      customer_email: "ana@example.com",
      customer_name: "Ana",
      total_cents: 2500,
      locale: "en",
    } as any);
    expect(email.subject).toMatch(/order/i);
  });

  it("includes each item's photo, name, size/color and line total", () => {
    const email = buildOrderConfirmationEmail(
      { customer_email: "ana@example.com", customer_name: "Ana", total_cents: 2500, locale: "es" } as any,
      [
        {
          quantity: 2,
          unitPriceCents: 1200,
          size: "0-3 meses",
          color: "Rosa",
          productNameEs: "Zapatitos Rosa",
          productNameEn: "Pink Booties",
          image: "/products/pink/1.jpg",
        },
      ]
    );
    expect(email.html).toContain("Zapatitos Rosa");
    expect(email.html).toContain("0-3 meses");
    expect(email.html).toContain("x2");
    expect(email.html).toContain("24.00");
    expect(email.html).toContain("https://celennytops.com/products/pink/1.jpg");
  });

  it("resolves an already-absolute image URL as-is", () => {
    const email = buildOrderConfirmationEmail(
      { customer_email: "ana@example.com", customer_name: "Ana", total_cents: 2500, locale: "es" } as any,
      [
        {
          quantity: 1,
          unitPriceCents: 500,
          size: null,
          color: null,
          productNameEs: "Set Minnie",
          productNameEn: "Minnie Set",
          image: "https://xptrfhqhaxtzbbcpvzfo.supabase.co/storage/v1/object/public/product-images/x.jpg",
        },
      ]
    );
    expect(email.html).toContain("https://xptrfhqhaxtzbbcpvzfo.supabase.co/storage/v1/object/public/product-images/x.jpg");
  });
});

describe("buildPaymentIssueEmail", () => {
  it("names the order and both amounts so the shop can reconcile manually", () => {
    const email = buildPaymentIssueEmail({
      orderId: "order-1",
      paypalOrderId: "pp-1",
      reason: "amount_mismatch",
      expectedCents: 5500,
      capturedValue: "1.00",
    });
    expect(email.subject).toContain("order-1");
    expect(email.subject).toContain("amount_mismatch");
    expect(email.html).toContain("55.00");
    expect(email.html).toContain("1.00");
    expect(email.html).toContain("pp-1");
  });

  it("says no amount was captured when PayPal reported none", () => {
    const email = buildPaymentIssueEmail({
      orderId: "order-2",
      paypalOrderId: "pp-2",
      reason: "payment_not_completed",
      expectedCents: 5500,
      capturedValue: null,
    });
    expect(email.html).toContain("ninguno");
  });
});
