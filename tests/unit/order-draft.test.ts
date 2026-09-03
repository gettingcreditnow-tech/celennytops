import { describe, it, expect } from "vitest";
import {
  buildOrderDraft,
  parseCartItems,
  type ShippingZoneRow,
  type VariantPricingRow,
} from "@/lib/order-draft";

const variants: VariantPricingRow[] = [
  { id: "v1", price_cents: 2500, stock: 3 },
  { id: "v2", price_cents: 1000, stock: 0 },
];

const zones: ShippingZoneRow[] = [
  { id: "z1", name: "Pais local", country_codes: ["CO"], rate_cents: 500 },
  { id: "z3", name: "Resto del mundo", country_codes: ["*"], rate_cents: 2500 },
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
