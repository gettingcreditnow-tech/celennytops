import type { ShippingZone } from "./types";

export function getShippingZoneForCountry(
  countryCode: string,
  zones: ShippingZone[]
): ShippingZone | null {
  const upper = countryCode.toUpperCase();
  const exact = zones.find((z) => z.countryCodes.includes(upper));
  if (exact) return exact;
  return zones.find((z) => z.countryCodes.includes("*")) ?? null;
}
