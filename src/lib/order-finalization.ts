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
    await sendAdminNewOrderEmail(order);
  } catch (err) {
    console.error(`Email send failed for order ${order.id}:`, err);
  }
}
