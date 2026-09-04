"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { ShippingZone } from "@/lib/types";

export function ShippingZonesForm({
  initialZones,
  initialFreeShippingMinQuantity,
}: {
  initialZones: ShippingZone[];
  initialFreeShippingMinQuantity: number;
}) {
  const [zones, setZones] = useState(initialZones);
  const [freeShippingMinQuantity, setFreeShippingMinQuantity] = useState(initialFreeShippingMinQuantity);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [thresholdError, setThresholdError] = useState<string | null>(null);

  async function saveZone(zone: ShippingZone) {
    const supabase = createBrowserSupabaseClient();
    await supabase
      .from("shipping_zones")
      .update({ name: zone.name, country_codes: zone.countryCodes, rate_cents: zone.rateCents })
      .eq("id", zone.id);
  }

  async function saveFreeShippingThreshold() {
    setThresholdError(null);
    setSavingThreshold(true);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase
      .from("store_settings")
      .update({ free_shipping_min_quantity: freeShippingMinQuantity })
      .eq("id", true);
    if (error) {
      setThresholdError(`No se pudo guardar: ${error.message}`);
    }
    setSavingThreshold(false);
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

      <div className="mt-4 flex items-center gap-2 border-t pt-4">
        <label>
          Minimo de articulos para envio gratis{" "}
          <input
            type="number"
            min={1}
            value={freeShippingMinQuantity}
            onChange={(e) => setFreeShippingMinQuantity(Number(e.target.value))}
          />
        </label>
        <button onClick={saveFreeShippingThreshold} disabled={savingThreshold}>
          {savingThreshold ? "Guardando..." : "Guardar"}
        </button>
      </div>
      {thresholdError && <p role="alert" className="text-red-600">{thresholdError}</p>}
    </div>
  );
}
