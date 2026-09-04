import type { ShippingZone } from "./types";

export function getShippingZoneForCountry(
  countryCode: string,
  zones: ShippingZone[],
  sector?: string
): ShippingZone | null {
  const upper = countryCode.toUpperCase();
  // Santo Domingo is split into sectors with their own rates - the country
  // code alone can't pick one, and there is no single "DO" zone to fall
  // back to if the caller didn't supply a sector.
  if (upper === "DO") {
    return zones.find((z) => z.countryCodes.includes("DO") && z.sector === sector) ?? null;
  }
  const exact = zones.find((z) => z.countryCodes.includes(upper));
  if (exact) return exact;
  return zones.find((z) => z.countryCodes.includes("*")) ?? null;
}
