"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { ShippingZone } from "@/lib/types";

export function ShippingZonesForm({
  initialZones,
  initialFreeShippingMinQuantity,
  initialShowFreeShippingBanner,
}: {
  initialZones: ShippingZone[];
  initialFreeShippingMinQuantity: number;
  initialShowFreeShippingBanner: boolean;
}) {
  const [zones, setZones] = useState(initialZones);
  const [freeShippingMinQuantity, setFreeShippingMinQuantity] = useState(initialFreeShippingMinQuantity);
  const [showFreeShippingBanner, setShowFreeShippingBanner] = useState(initialShowFreeShippingBanner);
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
    const { data, error } = await supabase
      .from("store_settings")
      .update({
        free_shipping_min_quantity: freeShippingMinQuantity,
        show_free_shipping_banner: showFreeShippingBanner,
      })
      .eq("id", true)
      .select();
    if (error) {
      setThresholdError(`No se pudo guardar: ${error.message}`);
    } else if (!data || data.length === 0) {
      setThresholdError("No se pudo guardar: sin permisos o la configuracion no existe.");
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

      <div className="mt-4 flex flex-col gap-2 border-t pt-4">
        <label>
          Minimo de articulos para envio gratis{" "}
          <input
            type="number"
            min={1}
            value={freeShippingMinQuantity}
            onChange={(e) => setFreeShippingMinQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showFreeShippingBanner}
            onChange={(e) => setShowFreeShippingBanner(e.target.checked)}
          />
          Mostrar aviso de envio gratis en la pagina principal
        </label>
        <button onClick={saveFreeShippingThreshold} disabled={savingThreshold} className="w-fit">
          {savingThreshold ? "Guardando..." : "Guardar"}
        </button>
      </div>
      {thresholdError && <p role="alert" className="text-red-600">{thresholdError}</p>}
    </div>
  );
}
