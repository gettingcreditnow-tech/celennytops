import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  buildOrderDraft,
  findReusablePendingOrder,
  parseCartItems,
  PENDING_ORDER_REUSE_WINDOW_MS,
  type PendingOrderCandidate,
} from "@/lib/order-draft";
import { createPayPalOrder } from "@/lib/paypal";

export async function POST(req: NextRequest) {
  const { items, customer, locale } = await req.json();

  const cartItems = parseCartItems(items);
  if (!cartItems) {
    return NextResponse.json({ error: "invalid_items" }, { status: 400 });
  }
  if (!customer?.countryCode || !customer?.name || !customer?.email || !customer?.address || !customer?.city) {
    return NextResponse.json({ error: "invalid_customer" }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { data: variants, error: variantsError } = await supabase
    .from("product_variants")
    .select("id, price_cents, stock")
    .in("id", cartItems.map((i) => i.variantId));
  if (variantsError || !variants) {
    return NextResponse.json({ error: "invalid_items" }, { status: 400 });
  }

  const { data: zones, error: zonesError } = await supabase.from("shipping_zones").select("*");
  if (zonesError || !zones) {
    return NextResponse.json({ error: "no_shipping_zone" }, { status: 400 });
  }

  // Prices, stock and shipping are all recomputed from the database rows here;
  // nothing the client sent besides variant ids and quantities is trusted.
  const draftResult = buildOrderDraft(cartItems, variants, zones, customer.countryCode);
  if (!draftResult.ok) {
    return NextResponse.json(draftResult.body, { status: draftResult.status });
  }
  const { lines, subtotalCents, shippingCents, totalCents, zone } = draftResult.draft;

  // This endpoint is unauthenticated and fires on every PayPal button click, so
  // without this an impatient shopper writes a new pending order (with their
  // full name, email and address) per click. Reuse the identical one instead.
  const { data: candidates } = (await supabase
    .from("orders")
    .select("paypal_order_id, order_items(variant_id, quantity, unit_price_cents)")
    .eq("status", "pending")
    .eq("customer_email", customer.email)
    .eq("customer_name", customer.name)
    .eq("address_line", customer.address)
    .eq("city", customer.city)
    .eq("country_code", customer.countryCode)
    .eq("total_cents", totalCents)
    .gte("created_at", new Date(Date.now() - PENDING_ORDER_REUSE_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(5)) as { data: PendingOrderCandidate[] | null };

  const reusablePaypalOrderId = findReusablePendingOrder(candidates ?? [], lines);
  if (reusablePaypalOrderId) {
    return NextResponse.json({ paypalOrderId: reusablePaypalOrderId });
  }

  const paypalOrder = await createPayPalOrder(totalCents, "USD");
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
      subtotal_cents: subtotalCents,
      shipping_cents: shippingCents,
      total_cents: totalCents,
      locale: locale === "en" ? "en" : "es",
      paypal_order_id: paypalOrder.id,
    })
    .select()
    .single();
  if (orderError || !orderRow) {
    return NextResponse.json({ error: "order_create_failed" }, { status: 500 });
  }

  const itemRows = lines.map((line) => ({
    order_id: orderRow.id,
    variant_id: line.variantId,
    quantity: line.quantity,
    unit_price_cents: line.unitPriceCents,
  }));
  const { error: itemsError } = await supabase.from("order_items").insert(itemRows);
  if (itemsError) {
    return NextResponse.json({ error: "order_create_failed" }, { status: 500 });
  }

  return NextResponse.json({ paypalOrderId: paypalOrder.id });
}
