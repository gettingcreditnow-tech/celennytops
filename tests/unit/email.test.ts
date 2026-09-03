import { describe, it, expect } from "vitest";
import { buildOrderConfirmationEmail } from "@/lib/email";

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
