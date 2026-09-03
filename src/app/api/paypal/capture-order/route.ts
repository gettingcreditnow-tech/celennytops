import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { capturePayPalOrder } from "@/lib/paypal";
import { sendOrderConfirmationEmail, sendAdminNewOrderEmail } from "@/lib/email";
import type { OrderItemRow, OrderRow } from "@/lib/types";

export async function POST(req: NextRequest) {
  const { paypalOrderId } = await req.json();
  if (!paypalOrderId) {
    return NextResponse.json({ error: "missing_paypal_order_id" }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  const { data: order, error: orderError } = (await supabase
    .from("orders")
    .select("*")
    .eq("paypal_order_id", paypalOrderId)
    .maybeSingle()) as { data: OrderRow | null; error: unknown };
  if (orderError || !order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }
  if (order.status === "paid") {
    // Already captured (e.g. a client retry) - idempotent success.
    return NextResponse.json({ orderId: order.id });
  }
  if (order.status !== "pending") {
    return NextResponse.json({ error: "invalid_order_status" }, { status: 409 });
  }

  const { data: items, error: itemsError } = (await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", order.id)) as { data: OrderItemRow[] | null; error: unknown };
  if (itemsError || !items) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  const capture = await capturePayPalOrder(paypalOrderId);
  if (capture?.status !== "COMPLETED") {
    return NextResponse.json({ error: "payment_not_completed" }, { status: 400 });
  }

  const capturedValue = capture.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value;
  const expectedValue = (order.total_cents / 100).toFixed(2);
  if (capturedValue !== expectedValue) {
    // Payment captured but doesn't match what we authorized at create-order time.
    // Do not mark paid or fulfill; needs manual review.
    return NextResponse.json({ error: "amount_mismatch" }, { status: 409 });
  }

  const { data: updatedOrder, error: updateError } = (await supabase
    .from("orders")
    .update({ status: "paid" })
    .eq("id", order.id)
    .eq("status", "pending")
    .select()
    .maybeSingle()) as { data: OrderRow | null; error: unknown };
  if (updateError) {
    return NextResponse.json({ error: "order_update_failed" }, { status: 500 });
  }
  if (!updatedOrder) {
    // Another concurrent request already flipped this order to paid first.
    // Payment was captured successfully either way, so this is a success from
    // the client's perspective - just don't decrement stock or send emails again.
    return NextResponse.json({ orderId: order.id });
  }

  for (const item of items) {
    const { error: rpcError } = await supabase.rpc("decrement_variant_stock", {
      p_variant_id: item.variant_id,
      p_quantity: item.quantity,
    });
    if (rpcError) {
      console.error(`Stock decrement failed for order ${order.id}, variant ${item.variant_id}:`, rpcError);
    }
  }

  try {
    await sendOrderConfirmationEmail(order);
    await sendAdminNewOrderEmail(order);
  } catch (err) {
    console.error(`Email send failed for order ${order.id}:`, err);
  }

  return NextResponse.json({ orderId: order.id });
}
