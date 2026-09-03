"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { ShippingZone } from "@/lib/types";

export function ShippingZonesForm({ initialZones }: { initialZones: ShippingZone[] }) {
  const [zones, setZones] = useState(initialZones);

  async function saveZone(zone: ShippingZone) {
    const supabase = createBrowserSupabaseClient();
    await supabase
      .from("shipping_zones")
      .update({ name: zone.name, country_codes: zone.countryCodes, rate_cents: zone.rateCents })
      .eq("id", zone.id);
  }

  return (
    <div className="flex flex-col gap-4 px-6 py-6">
      {zones.map((zone, idx) => (
        <div key={zone.id} className="flex gap-2">
          <input
            value={zone.name}
            onChange={(e) => {
              const next = [...zones]; next[idx] = { ...zone, name: e.target.value }; setZones(next);
            }}
          />
          <input
            value={zone.countryCodes.join(",")}
            onChange={(e) => {
              const next = [...zones]; next[idx] = { ...zone, countryCodes: e.target.value.split(",").map((c) => c.trim().toUpperCase()) }; setZones(next);
            }}
          />
          <input
            type="number"
            value={zone.rateCents}
            onChange={(e) => {
              const next = [...zones]; next[idx] = { ...zone, rateCents: Number(e.target.value) }; setZones(next);
            }}
          />
          <button onClick={() => saveZone(zones[idx])}>Guardar</button>
        </div>
      ))}
    </div>
  );
}
