import type { SupabaseClient } from "@supabase/supabase-js";
import { sendOrderConfirmationEmail, sendAdminNewOrderEmail, type OrderConfirmationItem } from "./email";
import type { OrderItemRow, OrderRow } from "./types";

/**
 * Looks up each line's product/variant details (photo, name, size, color) so
 * the confirmation email can show what was actually bought, not just a
 * total. Never throws: a lookup failure here must not stop the order from
 * completing (stock already decremented, payment already captured) - the
 * customer just gets a plainer confirmation email instead.
 */
async function loadConfirmationItems(
  supabase: SupabaseClient,
  orderId: string,
  items: OrderItemRow[]
): Promise<OrderConfirmationItem[]> {
  try {
    const { data: variants, error } = await supabase
      .from("product_variants")
      .select("id, size, color, products(name_es, name_en, images)")
      .in(
        "id",
        items.map((item) => item.variant_id)
      );
    if (error) throw error;
    return items.map((item) => {
      const variant = (variants ?? []).find((v: any) => v.id === item.variant_id) as any;
      return {
        quantity: item.quantity,
        unitPriceCents: item.unit_price_cents,
        size: variant?.size ?? null,
        color: variant?.color ?? null,
        productNameEs: variant?.products?.name_es ?? null,
        productNameEn: variant?.products?.name_en ?? null,
        image: variant?.products?.images?.[0] ?? null,
      };
    });
  } catch (err) {
    console.error(`Could not load item details for order ${orderId}'s confirmation email:`, err);
    return [];
  }
}

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

  const confirmationItems = await loadConfirmationItems(supabase, order.id, items);

  try {
    await sendOrderConfirmationEmail(order, confirmationItems);
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
