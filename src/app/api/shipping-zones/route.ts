import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase.from("shipping_zones").select("*"),
    supabase.from("store_settings").select("free_shipping_min_quantity").maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    zones: (data ?? []).map((z) => ({
      id: z.id,
      name: z.name,
      countryCodes: z.country_codes,
      sector: z.sector,
      rateCents: z.rate_cents,
    })),
    freeShippingMinQuantity: settings?.free_shipping_min_quantity ?? null,
  });
}
