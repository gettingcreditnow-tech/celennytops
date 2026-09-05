import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ShippingZonesForm } from "@/components/admin/ShippingZonesForm";

export default async function AdminShippingZonesPage() {
  const supabase = await createServerSupabaseClient();
  const [{ data }, { data: settings }] = await Promise.all([
    supabase.from("shipping_zones").select("*").order("sort_order"),
    supabase.from("store_settings").select("free_shipping_min_quantity, show_free_shipping_banner").maybeSingle(),
  ]);
  const zones = (data ?? []).map((z) => ({
    id: z.id,
    name: z.name,
    countryCodes: z.country_codes,
    sector: z.sector,
    rateCents: z.rate_cents,
  }));
  return (
    <ShippingZonesForm
      initialZones={zones}
      // Form default only if the row is somehow missing - does not reflect
      // live checkout behavior, which falls back to no-free-shipping in
      // that case (see the create-order routes' own ?? Infinity fallback).
      initialFreeShippingMinQuantity={settings?.free_shipping_min_quantity ?? 2}
      initialShowFreeShippingBanner={settings?.show_free_shipping_banner ?? true}
    />
  );
}
