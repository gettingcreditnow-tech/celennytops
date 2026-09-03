import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { computeSubtotalCents, computeTotalCents } from "@/lib/pricing";
import { getShippingZoneForCountry } from "@/lib/shipping";
import { createPayPalOrder } from "@/lib/paypal";

export async function POST(req: NextRequest) {
  const { items, customer, locale } = await req.json();

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "invalid_items" }, { status: 400 });
  }
  for (const i of items) {
    if (!i?.variantId || !Number.isInteger(i.quantity) || i.quantity <= 0) {
      return NextResponse.json({ error: "invalid_items" }, { status: 400 });
    }
  }
  if (!customer?.countryCode || !customer?.name || !customer?.email || !customer?.address || !customer?.city) {
    return NextResponse.json({ error: "invalid_customer" }, { status: 400 });
  }

  const variantIds = items.map((i: { variantId: string }) => i.variantId);
  const supabase = createAdminSupabaseClient();
  const { data: variants, error: variantsError } = await supabase
    .from("product_variants")
    .select("id, price_cents, stock")
    .in("id", variantIds);
  if (variantsError || !variants || variants.length !== new Set(variantIds).size) {
    return NextResponse.json({ error: "invalid_items" }, { status: 400 });
  }

  const lines = items.map((i: { variantId: string; quantity: number }) => {
    const variant = variants.find((v) => v.id === i.variantId);
    if (!variant) throw new Error("variant not found");
    return { unitPriceCents: variant.price_cents, quantity: i.quantity };
  });
  const subtotal = computeSubtotalCents(lines);

  const { data: zones, error: zonesError } = await supabase.from("shipping_zones").select("*");
  if (zonesError || !zones) {
    return NextResponse.json({ error: "no_shipping_zone" }, { status: 400 });
  }
  const zone = getShippingZoneForCountry(
    customer.countryCode,
    zones.map((z) => ({ id: z.id, name: z.name, countryCodes: z.country_codes, rateCents: z.rate_cents }))
  );
  if (!zone) return NextResponse.json({ error: "no_shipping_zone" }, { status: 400 });

  const total = computeTotalCents(subtotal, zone.rateCents);
  const paypalOrder = await createPayPalOrder(total, "USD");
  if (!paypalOrder?.id) {
    return NextResponse.json({ error: "paypal_order_failed" }, { status: 502 });
  }

  const { data: orderRow, error: orderError } = await supabase
    .from("orders")
    .insert({
      customer_name: customer.name,
      customer_email: customer.email,
      address_line: customer.address,
      city: customer.city,
      country_code: customer.countryCode,
      shipping_zone_id: zone.id,
      status: "pending",
      subtotal_cents: subtotal,
      shipping_cents: zone.rateCents,
      total_cents: total,
      locale: locale === "en" ? "en" : "es",
      paypal_order_id: paypalOrder.id,
    })
    .select()
    .single();
  if (orderError || !orderRow) {
    return NextResponse.json({ error: "order_create_failed" }, { status: 500 });
  }

  const itemRows = items.map((i: { variantId: string; quantity: number }) => {
    const variant = variants.find((v) => v.id === i.variantId)!;
    return {
      order_id: orderRow.id,
      variant_id: i.variantId,
      quantity: i.quantity,
      unit_price_cents: variant.price_cents,
    };
  });
  const { error: itemsError } = await supabase.from("order_items").insert(itemRows);
  if (itemsError) {
    return NextResponse.json({ error: "order_create_failed" }, { status: 500 });
  }

  return NextResponse.json({ paypalOrderId: paypalOrder.id });
}
