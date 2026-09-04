import { describe, it, expect } from "vitest";
import { getShippingZoneForCountry } from "@/lib/shipping";
import type { ShippingZone } from "@/lib/types";

const zones: ShippingZone[] = [
  { id: "1", name: "Pais local", countryCodes: ["CO"], sector: null, rateCents: 500 },
  { id: "2", name: "Latinoamerica", countryCodes: ["MX", "AR"], sector: null, rateCents: 1200 },
  { id: "3", name: "Resto del mundo", countryCodes: ["*"], sector: null, rateCents: 2500 },
];

const doZones: ShippingZone[] = [
  { id: "sdo", name: "Santo Domingo Oeste", countryCodes: ["DO"], sector: "Santo Domingo Oeste", rateCents: 400 },
  { id: "dn", name: "Distrito Nacional", countryCodes: ["DO"], sector: "Distrito Nacional", rateCents: 500 },
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

describe("getShippingZoneForCountry with Santo Domingo sectors", () => {
  it("matches the zone whose sector equals the requested one", () => {
    expect(getShippingZoneForCountry("DO", doZones, "Distrito Nacional")?.id).toBe("dn");
  });

  it("returns null for DO without a sector", () => {
    expect(getShippingZoneForCountry("DO", doZones)).toBeNull();
  });

  it("returns null for DO with an unknown sector", () => {
    expect(getShippingZoneForCountry("DO", doZones, "Nowhere")).toBeNull();
  });

  it("is case-insensitive on the country code for DO too", () => {
    expect(getShippingZoneForCountry("do", doZones, "Santo Domingo Oeste")?.id).toBe("sdo");
  });

  it("still matches non-DO countries by country code, ignoring sector", () => {
    expect(getShippingZoneForCountry("MX", zones)?.id).toBe("2");
  });
});
