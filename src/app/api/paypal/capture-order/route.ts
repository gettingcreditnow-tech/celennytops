import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { capturePayPalOrder } from "@/lib/paypal";
import { sendAdminPaymentIssueEmail, type PaymentIssueInput } from "@/lib/email";
import { finalizeOrderPayment } from "@/lib/order-finalization";
import { formatUsd } from "@/lib/pricing";
import type { OrderItemRow, OrderRow } from "@/lib/types";

/**
 * A capture we refused to accept means the customer got an error page and the
 * order stays `pending` forever - so it has to reach a human. Logged always,
 * emailed best-effort.
 */
async function reportPaymentIssue(issue: PaymentIssueInput): Promise<void> {
  console.error(
    `PayPal capture rejected (${issue.reason}) for order ${issue.orderId} ` +
      `[paypal ${issue.paypalOrderId}]: expected $${formatUsd(issue.expectedCents)} USD, ` +
      `captured ${issue.capturedValue === null ? "none" : `$${issue.capturedValue} USD`}`
  );
  try {
    await sendAdminPaymentIssueEmail(issue);
  } catch (err) {
    console.error(`Payment issue alert email failed for order ${issue.orderId}:`, err);
  }
}

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
  const capturedValue: string | null =
    capture?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ?? null;

  if (capture?.status !== "COMPLETED") {
    await reportPaymentIssue({
      orderId: order.id,
      paypalOrderId,
      reason: "payment_not_completed",
      expectedCents: order.total_cents,
      capturedValue,
    });
    return NextResponse.json({ error: "payment_not_completed" }, { status: 400 });
  }

  const expectedValue = formatUsd(order.total_cents);
  if (capturedValue !== expectedValue) {
    // Payment captured but doesn't match what we authorized at create-order time.
    // Do not mark paid or fulfill; needs manual review.
    await reportPaymentIssue({
      orderId: order.id,
      paypalOrderId,
      reason: "amount_mismatch",
      expectedCents: order.total_cents,
      capturedValue,
    });
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

  await finalizeOrderPayment(supabase, updatedOrder, items);

  return NextResponse.json({ orderId: order.id });
}
