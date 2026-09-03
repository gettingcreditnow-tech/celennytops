import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("shipping_zones").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    (data ?? []).map((z) => ({
      id: z.id,
      name: z.name,
      countryCodes: z.country_codes,
      rateCents: z.rate_cents,
    }))
  );
}
