import { computeSubtotalCents, computeTotalCents } from "./pricing";
import { getShippingZoneForCountry } from "./shipping";
import type { ShippingZone } from "./types";

/**
 * Server-side derivation of what a cart actually costs. The client sends only
 * variant ids and quantities; every cent here comes from the database rows the
 * caller looked up, never from the request body.
 */

export type CartItemInput = { variantId: string; quantity: number };

/** The columns create-order selects from `product_variants`. */
export type VariantPricingRow = { id: string; price_cents: number; stock: number };

/** The columns create-order selects from `shipping_zones`. */
export type ShippingZoneRow = {
  id: string;
  name: string;
  country_codes: string[];
  rate_cents: number;
};

export type OrderDraftLine = {
  variantId: string;
  quantity: number;
  unitPriceCents: number;
};

export type OrderDraft = {
  lines: OrderDraftLine[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  zone: ShippingZone;
};

export type OrderDraftErrorBody =
  | { error: "invalid_items" }
  | {
      error: "insufficient_stock";
      variantId: string;
      requested: number;
      available: number;
    }
  | { error: "no_shipping_zone" };

export type OrderDraftResult =
  | { ok: true; draft: OrderDraft }
  | { ok: false; status: number; body: OrderDraftErrorBody };

/**
 * Validates the shape of the client's cart payload. Returns null when it is
 * unusable, so the caller can reject before touching the database.
 * Duplicate lines for one variant are rejected: they would make the per-line
 * stock check below meaningless.
 */
export function parseCartItems(items: unknown): CartItemInput[] | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  const parsed: CartItemInput[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const variantId = (raw as Partial<CartItemInput> | null)?.variantId;
    const quantity = (raw as Partial<CartItemInput> | null)?.quantity;
    if (typeof variantId !== "string" || variantId.length === 0) return null;
    if (!Number.isInteger(quantity) || (quantity as number) <= 0) return null;
    if (seen.has(variantId)) return null;
    seen.add(variantId);
    parsed.push({ variantId, quantity: quantity as number });
  }
  return parsed;
}

export function toShippingZone(row: ShippingZoneRow): ShippingZone {
  return {
    id: row.id,
    name: row.name,
    countryCodes: row.country_codes,
    rateCents: row.rate_cents,
  };
}

export function buildOrderDraft(
  items: CartItemInput[],
  variants: VariantPricingRow[],
  zones: ShippingZoneRow[],
  countryCode: string
): OrderDraftResult {
  const lines: OrderDraftLine[] = [];

  for (const item of items) {
    const variant = variants.find((v) => v.id === item.variantId);
    // Unknown id: stale cart, deleted variant, or a tampered payload.
    if (!variant) return { ok: false, status: 400, body: { error: "invalid_items" } };
    if (item.quantity > variant.stock) {
      return {
        ok: false,
        status: 409,
        body: {
          error: "insufficient_stock",
          variantId: variant.id,
          requested: item.quantity,
          available: variant.stock,
        },
      };
    }
    lines.push({
      variantId: item.variantId,
      quantity: item.quantity,
      unitPriceCents: variant.price_cents,
    });
  }

  const zone = getShippingZoneForCountry(countryCode, zones.map(toShippingZone));
  if (!zone) return { ok: false, status: 400, body: { error: "no_shipping_zone" } };

  const subtotalCents = computeSubtotalCents(lines);
  return {
    ok: true,
    draft: {
      lines,
      subtotalCents,
      shippingCents: zone.rateCents,
      totalCents: computeTotalCents(subtotalCents, zone.rateCents),
      zone,
    },
  };
}

/**
 * How far back create-order looks for a pending order it can reuse. Long enough
 * to absorb a shopper clicking the PayPal button repeatedly, short enough that
 * the reused PayPal order has not expired.
 */
export const PENDING_ORDER_REUSE_WINDOW_MS = 15 * 60 * 1000;

export type PendingOrderCandidate = {
  paypal_order_id: string | null;
  order_items:
    | { variant_id: string; quantity: number; unit_price_cents: number }[]
    | null;
};

function itemsMatchLines(
  items: NonNullable<PendingOrderCandidate["order_items"]>,
  lines: OrderDraftLine[]
): boolean {
  if (items.length !== lines.length) return false;
  // parseCartItems rejects duplicate variant ids, so one item per line.
  return lines.every((line) =>
    items.some(
      (item) =>
        item.variant_id === line.variantId &&
        item.quantity === line.quantity &&
        item.unit_price_cents === line.unitPriceCents
    )
  );
}

/**
 * Finds an existing pending order the caller can reuse instead of writing a new
 * one. Every PayPal button click otherwise inserts a fresh orders row with the
 * customer's PII, from an unauthenticated endpoint, before any payment happens.
 *
 * Candidates must already be filtered (same customer, address, total, status
 * pending, recent); this only confirms the line items are identical.
 */
export function findReusablePendingOrder(
  candidates: PendingOrderCandidate[],
  lines: OrderDraftLine[]
): string | null {
  for (const candidate of candidates) {
    if (!candidate.paypal_order_id) continue;
    if (itemsMatchLines(candidate.order_items ?? [], lines)) {
      return candidate.paypal_order_id;
    }
  }
  return null;
}
