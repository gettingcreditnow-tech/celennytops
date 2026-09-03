import { describe, it, expect } from "vitest";
import { getShippingZoneForCountry } from "@/lib/shipping";
import type { ShippingZone } from "@/lib/types";

const zones: ShippingZone[] = [
  { id: "1", name: "Pais local", countryCodes: ["CO"], rateCents: 500 },
  { id: "2", name: "Latinoamerica", countryCodes: ["MX", "AR"], rateCents: 1200 },
  { id: "3", name: "Resto del mundo", countryCodes: ["*"], rateCents: 2500 },
];

describe("getShippingZoneForCountry", () => {
  it("matches an explicit country code", () => {
    expect(getShippingZoneForCountry("CO", zones)?.id).toBe("1");
  });

  it("is case-insensitive", () => {
    expect(getShippingZoneForCountry("mx", zones)?.id).toBe("2");
  });

  it("falls back to the catch-all zone for unlisted countries", () => {
    expect(getShippingZoneForCountry("DE", zones)?.id).toBe("3");
  });

  it("returns null when there is no catch-all and no match", () => {
    const noCatchAll = zones.slice(0, 2);
    expect(getShippingZoneForCountry("DE", noCatchAll)).toBeNull();
  });
});
