import type { SupabaseClient } from "@supabase/supabase-js";
import { sendOrderConfirmationEmail, sendAdminNewOrderEmail } from "./email";
import type { OrderItemRow, OrderRow } from "./types";

/**
 * Everything that happens once an order is confirmed paid, regardless of how
 * payment was confirmed (PayPal capture, or an admin approving a bank
 * transfer proof): decrement stock for each line, then notify the customer
 * and the shop inbox. Stock decrement failures are logged, not thrown - a
 * paid order must not fail to close over a stock bookkeeping error.
 */
export async function finalizeOrderPayment(
  supabase: SupabaseClient,
  order: OrderRow,
  items: OrderItemRow[]
): Promise<void> {
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
    // Bank-transfer orders already notified the admin at creation time (with
    // a note to review the proof) - sending it again here would just be a
    // second identically-subjected email the moment the admin approves their
    // own order. PayPal orders have no earlier admin notification, so they
    // still need this one.
    if (order.payment_method !== "bank_transfer") {
      await sendAdminNewOrderEmail(order);
    }
  } catch (err) {
    console.error(`Email send failed for order ${order.id}:`, err);
  }
}
