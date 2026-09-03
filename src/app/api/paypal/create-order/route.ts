import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { computeSubtotalCents, computeTotalCents } from "@/lib/pricing";
import { getShippingZoneForCountry } from "@/lib/shipping";
import { createPayPalOrder } from "@/lib/paypal";

export async function POST(req: NextRequest) {
  const { items, countryCode } = await req.json();
  const variantIds = items.map((i: { variantId: string }) => i.variantId);

  const supabase = createAdminSupabaseClient();
  const { data: variants, error } = await supabase
    .from("product_variants")
    .select("id, price_cents, stock")
    .in("id", variantIds);
  if (error || !variants) {
    return NextResponse.json({ error: "invalid_items" }, { status: 400 });
  }

  const lines = items.map((i: { variantId: string; quantity: number }) => {
    const variant = variants.find((v) => v.id === i.variantId);
    if (!variant) throw new Error("variant not found");
    return { unitPriceCents: variant.price_cents, quantity: i.quantity };
  });
  const subtotal = computeSubtotalCents(lines);

  const { data: zones } = await supabase.from("shipping_zones").select("*");
  const zone = getShippingZoneForCountry(
    countryCode,
    (zones ?? []).map((z) => ({
      id: z.id,
      name: z.name,
      countryCodes: z.country_codes,
      rateCents: z.rate_cents,
    }))
  );
  if (!zone) return NextResponse.json({ error: "no_shipping_zone" }, { status: 400 });

  const total = computeTotalCents(subtotal, zone.rateCents);
  const paypalOrder = await createPayPalOrder(total, "USD");

  return NextResponse.json({ paypalOrderId: paypalOrder.id });
}
