import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { createAdminSupabaseClient } = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient }));

import { GET } from "@/app/api/orders/[id]/confirmation/route";

type Result = { data: unknown; error: unknown };

const order = {
  id: "order-1",
  customer_name: "Ana",
  address_line: "Calle 1",
  city: "Distrito Nacional",
  country_code: "DO",
  status: "paid",
  payment_method: "paypal",
  subtotal_cents: 1200,
  shipping_cents: 500,
  total_cents: 1700,
  locale: "es",
};

const items = [
  {
    quantity: 1,
    unit_price_cents: 1200,
    product_variants: {
      size: "0-3 meses",
      color: "Rosa",
      products: { name_es: "Zapatitos Rosa", name_en: "Pink Booties", images: ["/products/pink/1.jpg"] },
    },
  },
];

function createSupabaseStub(opts: { order: Result; items?: Result }) {
  return {
    from(table: string) {
      if (table === "orders") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => opts.order }) }) };
      }
      if (table === "order_items") {
        return { select: () => ({ eq: async () => opts.items ?? { data: [], error: null } }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function get(id: string) {
  return GET({} as NextRequest, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/orders/[id]/confirmation", () => {
  it("returns the order and its items with product photo/name/size/color", async () => {
    createAdminSupabaseClient.mockReturnValue(
      createSupabaseStub({ order: { data: order, error: null }, items: { data: items, error: null } })
    );

    const res = await get("order-1");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      order: {
        id: "order-1",
        customerName: "Ana",
        addressLine: "Calle 1",
        city: "Distrito Nacional",
        countryCode: "DO",
        status: "paid",
        paymentMethod: "paypal",
        subtotalCents: 1200,
        shippingCents: 500,
        totalCents: 1700,
        locale: "es",
      },
      items: [
        {
          quantity: 1,
          unitPriceCents: 1200,
          size: "0-3 meses",
          color: "Rosa",
          productNameEs: "Zapatitos Rosa",
          productNameEn: "Pink Booties",
          image: "/products/pink/1.jpg",
        },
      ],
    });
  });

  it("404s for an order id that doesn't exist", async () => {
    createAdminSupabaseClient.mockReturnValue(createSupabaseStub({ order: { data: null, error: null } }));

    const res = await get("missing-order");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "order_not_found" });
  });
});
