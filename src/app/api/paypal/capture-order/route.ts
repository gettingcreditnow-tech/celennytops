import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { capturePayPalOrder, buildOrderRecord } from "@/lib/paypal";
import { getShippingZoneForCountry } from "@/lib/shipping";
import { sendOrderConfirmationEmail, sendAdminNewOrderEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { paypalOrderId, items, customer, locale } = await req.json();

  const capture = await capturePayPalOrder(paypalOrderId);
  if (capture.status !== "COMPLETED") {
    return NextResponse.json({ error: "payment_not_completed" }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const variantIds = items.map((i: { variantId: string }) => i.variantId);
  const { data: variants } = await supabase
    .from("product_variants")
    .select("id, price_cents, stock")
    .in("id", variantIds);

  const { data: zones } = await supabase.from("shipping_zones").select("*");
  const zone = getShippingZoneForCountry(
    customer.countryCode,
    (zones ?? []).map((z) => ({ id: z.id, name: z.name, countryCodes: z.country_codes, rateCents: z.rate_cents }))
  );
  if (!zone || !variants) {
    return NextResponse.json({ error: "invalid_order" }, { status: 400 });
  }

  const record = buildOrderRecord({
    items,
    variants,
    zone,
    customer,
    locale,
    paypalOrderId,
  });

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert(record.order)
    .select()
    .single();
  if (orderError || !order) {
    return NextResponse.json({ error: "order_insert_failed" }, { status: 500 });
  }

  await supabase
    .from("order_items")
    .insert(record.items.map((i) => ({ ...i, order_id: order.id })));

  // Atomic stock decrement per item; if a variant sold out between add-to-cart
  // and payment capture, the order still stands (already paid) but the admin
  // must review it manually via the admin panel.
  for (const item of record.items) {
    await supabase.rpc("decrement_variant_stock", {
      p_variant_id: item.variant_id,
      p_quantity: item.quantity,
    });
  }

  await sendOrderConfirmationEmail(order);
  await sendAdminNewOrderEmail(order);

  return NextResponse.json({ orderId: order.id });
}
