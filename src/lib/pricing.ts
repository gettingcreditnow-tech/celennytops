export type OrderLineInput = { unitPriceCents: number; quantity: number };

export function computeSubtotalCents(lines: OrderLineInput[]): number {
  return lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
}

export function computeTotalCents(subtotalCents: number, shippingCents: number): number {
  return subtotalCents + shippingCents;
}

export function formatUsd(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Display-only conversion for the storefront (product prices, cart,
// checkout totals) - the actual charge stays in USD cents everywhere else
// (PayPal, capture-order's amount verification, admin panel, emails), so
// this must never feed back into any stored or charged amount.
const USD_TO_DOP_RATE = 60;

export function usdCentsToDop(usdCents: number): number {
  return Math.round((usdCents / 100) * USD_TO_DOP_RATE);
}

export function formatDop(usdCents: number): string {
  return usdCentsToDop(usdCents).toLocaleString("es-DO");
}

// Inverse of usdCentsToDop, used by the admin product form so prices can be
// entered in RD$ (what a customer actually sees) instead of raw USD cents.
export function dopToUsdCents(dop: number): number {
  return Math.round((dop / USD_TO_DOP_RATE) * 100);
}
