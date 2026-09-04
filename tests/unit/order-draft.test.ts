import { describe, it, expect } from "vitest";
import {
  buildOrderDraft,
  findReusablePendingOrder,
  parseCartItems,
  type ShippingZoneRow,
  type VariantPricingRow,
} from "@/lib/order-draft";

const variants: VariantPricingRow[] = [
  { id: "v1", price_cents: 2500, stock: 3 },
  { id: "v2", price_cents: 1000, stock: 0 },
];

const zones: ShippingZoneRow[] = [
  { id: "z1", name: "Pais local", country_codes: ["CO"], sector: null, rate_cents: 500 },
  { id: "z3", name: "Resto del mundo", country_codes: ["*"], sector: null, rate_cents: 2500 },
];

describe("parseCartItems", () => {
  it("accepts a well-formed cart", () => {
    expect(parseCartItems([{ variantId: "v1", quantity: 2 }])).toEqual([
      { variantId: "v1", quantity: 2 },
    ]);
  });

  it("rejects an empty or non-array payload", () => {
    expect(parseCartItems([])).toBeNull();
    expect(parseCartItems(null)).toBeNull();
    expect(parseCartItems("v1")).toBeNull();
  });

  it("rejects missing ids and non-positive or fractional quantities", () => {
    expect(parseCartItems([{ quantity: 1 }])).toBeNull();
    expect(parseCartItems([{ variantId: "v1", quantity: 0 }])).toBeNull();
    expect(parseCartItems([{ variantId: "v1", quantity: -2 }])).toBeNull();
    expect(parseCartItems([{ variantId: "v1", quantity: 1.5 }])).toBeNull();
  });

  it("rejects duplicate lines for the same variant", () => {
    expect(
      parseCartItems([
        { variantId: "v1", quantity: 1 },
        { variantId: "v1", quantity: 1 },
      ])
    ).toBeNull();
  });
});

describe("buildOrderDraft", () => {
  it("prices lines from the database rows and adds the matching shipping zone", () => {
    const result = buildOrderDraft(
      [{ variantId: "v1", quantity: 2 }],
      variants,
      zones,
      "CO"
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.lines).toEqual([
      { variantId: "v1", quantity: 2, unitPriceCents: 2500 },
    ]);
    expect(result.draft.subtotalCents).toBe(5000);
    expect(result.draft.shippingCents).toBe(500);
    expect(result.draft.totalCents).toBe(5500);
    expect(result.draft.zone.id).toBe("z1");
  });

  it("falls back to the catch-all zone for an unlisted country", () => {
    const result = buildOrderDraft([{ variantId: "v1", quantity: 1 }], variants, zones, "de");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.totalCents).toBe(2500 + 2500);
  });

  it("rejects a stale or bogus variant id with 400 invalid_items", () => {
    const result = buildOrderDraft([{ variantId: "nope", quantity: 1 }], variants, zones, "CO");
    expect(result).toEqual({ ok: false, status: 400, body: { error: "invalid_items" } });
  });

  it("rejects a quantity above the variant's stock with a structured 409", () => {
    const result = buildOrderDraft([{ variantId: "v1", quantity: 4 }], variants, zones, "CO");
    expect(result).toEqual({
      ok: false,
      status: 409,
      body: {
        error: "insufficient_stock",
        variantId: "v1",
        requested: 4,
        available: 3,
      },
    });
  });

  it("rejects any quantity of an out-of-stock variant", () => {
    const result = buildOrderDraft([{ variantId: "v2", quantity: 1 }], variants, zones, "CO");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.body).toMatchObject({ error: "insufficient_stock", available: 0 });
  });

  it("allows a quantity exactly equal to stock", () => {
    const result = buildOrderDraft([{ variantId: "v1", quantity: 3 }], variants, zones, "CO");
    expect(result.ok).toBe(true);
  });

  it("rejects a country with no zone and no catch-all", () => {
    const result = buildOrderDraft(
      [{ variantId: "v1", quantity: 1 }],
      variants,
      zones.slice(0, 1),
      "DE"
    );
    expect(result).toEqual({ ok: false, status: 400, body: { error: "no_shipping_zone" } });
  });

  it("never trusts a client-supplied price", () => {
    const tampered = [{ variantId: "v1", quantity: 1, unitPriceCents: 1 }] as never;
    const result = buildOrderDraft(tampered, variants, zones, "CO");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.subtotalCents).toBe(2500);
  });
});

describe("buildOrderDraft with Santo Domingo sectors", () => {
  const doZones: ShippingZoneRow[] = [
    { id: "sdo", name: "Santo Domingo Oeste", country_codes: ["DO"], sector: "Santo Domingo Oeste", rate_cents: 400 },
    { id: "dn", name: "Distrito Nacional", country_codes: ["DO"], sector: "Distrito Nacional", rate_cents: 500 },
  ];

  it("uses the rate of the matching sector", () => {
    const result = buildOrderDraft(
      [{ variantId: "v1", quantity: 1 }],
      variants,
      doZones,
      "DO",
      "Distrito Nacional"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft.shippingCents).toBe(500);
  });

  it("fails with no_shipping_zone when the sector is missing", () => {
    const result = buildOrderDraft([{ variantId: "v1", quantity: 1 }], variants, doZones, "DO");
    expect(result).toEqual({ ok: false, status: 400, body: { error: "no_shipping_zone" } });
  });
});

describe("buildOrderDraft free shipping by quantity", () => {
  const localVariants: VariantPricingRow[] = [
    { id: "v1", price_cents: 2500, stock: 5 },
    { id: "v2", price_cents: 1000, stock: 5 },
  ];
  const localZones: ShippingZoneRow[] = [
    { id: "z1", name: "Pais local", country_codes: ["CO"], sector: null, rate_cents: 500 },
  ];

  it("charges the normal rate when total quantity is below the threshold", () => {
    const result = buildOrderDraft([{ variantId: "v1", quantity: 1 }], localVariants, localZones, "CO", undefined, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.shippingCents).toBe(500);
    expect(result.draft.freeShippingApplied).toBe(false);
  });

  it("zeroes shipping once a single line's quantity meets the threshold", () => {
    const result = buildOrderDraft([{ variantId: "v1", quantity: 2 }], localVariants, localZones, "CO", undefined, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.shippingCents).toBe(0);
    expect(result.draft.totalCents).toBe(result.draft.subtotalCents);
    expect(result.draft.freeShippingApplied).toBe(true);
    expect(result.draft.zone.rateCents).toBe(500);
  });

  it("sums quantity across multiple lines toward the threshold", () => {
    const result = buildOrderDraft(
      [
        { variantId: "v1", quantity: 1 },
        { variantId: "v2", quantity: 1 },
      ],
      localVariants,
      localZones,
      "CO",
      undefined,
      2
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.freeShippingApplied).toBe(true);
    expect(result.draft.shippingCents).toBe(0);
  });

  it("defaults to no free-shipping threshold when the parameter is omitted", () => {
    const result = buildOrderDraft([{ variantId: "v1", quantity: 5 }], localVariants, localZones, "CO");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.shippingCents).toBe(500);
    expect(result.draft.freeShippingApplied).toBe(false);
  });
});

describe("findReusablePendingOrder", () => {
  const lines = [
    { variantId: "v1", quantity: 2, unitPriceCents: 2500 },
    { variantId: "v2", quantity: 1, unitPriceCents: 1000 },
  ];
  const matchingItems = [
    { variant_id: "v2", quantity: 1, unit_price_cents: 1000 },
    { variant_id: "v1", quantity: 2, unit_price_cents: 2500 },
  ];

  it("reuses a pending order whose items match, regardless of row order", () => {
    expect(
      findReusablePendingOrder([{ paypal_order_id: "pp-1", order_items: matchingItems }], lines)
    ).toBe("pp-1");
  });

  it("ignores a candidate with a different quantity", () => {
    const items = matchingItems.map((i) =>
      i.variant_id === "v1" ? { ...i, quantity: 3 } : i
    );
    expect(findReusablePendingOrder([{ paypal_order_id: "pp-1", order_items: items }], lines)).toBeNull();
  });

  it("ignores a candidate with a different variant or a different price", () => {
    expect(
      findReusablePendingOrder(
        [
          { paypal_order_id: "pp-1", order_items: [...matchingItems.slice(1), { variant_id: "v9", quantity: 1, unit_price_cents: 1000 }] },
          { paypal_order_id: "pp-2", order_items: matchingItems.map((i) => ({ ...i, unit_price_cents: 1 })) },
        ],
        lines
      )
    ).toBeNull();
  });

  it("ignores candidates with extra or missing lines", () => {
    expect(
      findReusablePendingOrder([{ paypal_order_id: "pp-1", order_items: matchingItems.slice(0, 1) }], lines)
    ).toBeNull();
    expect(
      findReusablePendingOrder(
        [
          {
            paypal_order_id: "pp-1",
            order_items: [...matchingItems, { variant_id: "v3", quantity: 1, unit_price_cents: 100 }],
          },
        ],
        lines
      )
    ).toBeNull();
  });

  it("skips candidates with no PayPal order id and returns the first usable match", () => {
    expect(
      findReusablePendingOrder(
        [
          { paypal_order_id: null, order_items: matchingItems },
          { paypal_order_id: "pp-2", order_items: matchingItems },
        ],
        lines
      )
    ).toBe("pp-2");
  });

  it("returns null when there are no candidates", () => {
    expect(findReusablePendingOrder([], lines)).toBeNull();
  });
});
