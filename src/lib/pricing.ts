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
