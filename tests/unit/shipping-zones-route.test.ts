import { describe, it, expect, vi, beforeEach } from "vitest";

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

import { GET } from "@/app/api/shipping-zones/route";

const zoneRow = {
  id: "z1",
  name: "Distrito Nacional",
  country_codes: ["DO"],
  sector: "Distrito Nacional",
  rate_cents: 500,
};

function createSupabaseStub(opts: {
  zones?: { data: unknown; error: unknown };
  settings?: { data: unknown; error: unknown };
}) {
  return {
    from(table: string) {
      if (table === "shipping_zones") {
        return { select: async () => opts.zones ?? { data: [zoneRow], error: null } };
      }
      if (table === "store_settings") {
        return {
          select: () => ({
            maybeSingle: async () => opts.settings ?? { data: { free_shipping_min_quantity: 2 }, error: null },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/shipping-zones", () => {
  it("returns the mapped zones alongside the free-shipping threshold", async () => {
    createServerSupabaseClient.mockResolvedValue(createSupabaseStub({}));

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      zones: [{ id: "z1", name: "Distrito Nacional", countryCodes: ["DO"], sector: "Distrito Nacional", rateCents: 500 }],
      freeShippingMinQuantity: 2,
    });
  });

  it("returns null for the threshold when the settings row is missing", async () => {
    createServerSupabaseClient.mockResolvedValue(createSupabaseStub({ settings: { data: null, error: null } }));

    const res = await GET();

    expect((await res.json()).freeShippingMinQuantity).toBeNull();
  });

  it("500s when the zones query fails", async () => {
    createServerSupabaseClient.mockResolvedValue(
      createSupabaseStub({ zones: { data: null, error: { message: "boom" } } })
    );

    const res = await GET();

    expect(res.status).toBe(500);
  });
});
