import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { createPayPalOrder } from "@/lib/paypal";

const originalFetch = global.fetch;

beforeEach(() => {
  process.env.PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";
  process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID = "client-id";
  process.env.PAYPAL_CLIENT_SECRET = "secret";
});

describe("createPayPalOrder", () => {
  it("requests an access token then creates an order with the given total", async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string, init?: any) => {
      calls.push(url);
      if (url.endsWith("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
      }
      if (url.endsWith("/v2/checkout/orders")) {
        const body = JSON.parse(init.body);
        expect(body.purchase_units[0].amount.value).toBe("72.00");
        expect(init.headers.Authorization).toBe("Bearer tok");
        return new Response(JSON.stringify({ id: "order-123" }), { status: 201 });
      }
      throw new Error("unexpected URL " + url);
    }) as any;

    const result = await createPayPalOrder(7200, "USD");
    expect(result.id).toBe("order-123");
    expect(calls).toHaveLength(2);
  });
});

afterAll(() => {
  global.fetch = originalFetch;
});
