import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ShippingZonesForm } from "@/components/admin/ShippingZonesForm";

export default async function AdminShippingZonesPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("shipping_zones").select("*").order("sort_order");
  const zones = (data ?? []).map((z) => ({ id: z.id, name: z.name, countryCodes: z.country_codes, rateCents: z.rate_cents }));
  return <ShippingZonesForm initialZones={zones} />;
}
