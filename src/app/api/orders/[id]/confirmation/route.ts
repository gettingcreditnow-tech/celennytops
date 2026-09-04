import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

// Public and unauthenticated by design, same as the checkout create-order
// routes: the order id is a random UUID a customer only learns from the
// redirect right after their own checkout, never listed or guessable, so
// knowing it is the access proof - the same model most storefronts use for
// a post-checkout confirmation/receipt page. RLS on `orders`/`order_items`
// is admin-only (see 0002_admin_allowlist.sql), so this route reads via the
// service-role client and returns only what a receipt needs - no
// payment_proof_path, no paypal_order_id.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminSupabaseClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, customer_name, address_line, city, country_code, status, payment_method, subtotal_cents, shipping_cents, total_cents, locale"
    )
    .eq("id", id)
    .maybeSingle();
  if (orderError || !order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("quantity, unit_price_cents, product_variants(size, color, products(name_es, name_en, images))")
    .eq("order_id", id);
  if (itemsError) {
    return NextResponse.json({ error: "order_items_lookup_failed" }, { status: 500 });
  }

  return NextResponse.json({
    order: {
      id: order.id,
      customerName: order.customer_name,
      addressLine: order.address_line,
      city: order.city,
      countryCode: order.country_code,
      status: order.status,
      paymentMethod: order.payment_method,
      subtotalCents: order.subtotal_cents,
      shippingCents: order.shipping_cents,
      totalCents: order.total_cents,
      locale: order.locale,
    },
    items: (items ?? []).map((item: any) => ({
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      size: item.product_variants?.size ?? null,
      color: item.product_variants?.color ?? null,
      productNameEs: item.product_variants?.products?.name_es ?? null,
      productNameEn: item.product_variants?.products?.name_en ?? null,
      image: item.product_variants?.products?.images?.[0] ?? null,
    })),
  });
}
