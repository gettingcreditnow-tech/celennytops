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
