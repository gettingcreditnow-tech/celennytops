import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { finalizeOrderPayment } from "@/lib/order-finalization";
import type { OrderItemRow, OrderRow } from "@/lib/types";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: order, error: orderError } = (await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle()) as { data: OrderRow | null; error: unknown };
  if (orderError || !order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }
  if (order.payment_method !== "bank_transfer") {
    return NextResponse.json({ error: "not_bank_transfer" }, { status: 400 });
  }
  if (order.status !== "pending") {
    return NextResponse.json({ error: "invalid_order_status" }, { status: 409 });
  }

  // The update itself is what RLS's "admin update orders" policy gates - a
  // non-admin's session client would have this affect 0 rows, same as a lost
  // compare-and-swap race, and both fall into the branch below.
  const { data: updatedOrder, error: updateError } = (await supabase
    .from("orders")
    .update({ status: "paid" })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .maybeSingle()) as { data: OrderRow | null; error: unknown };
  if (updateError) {
    return NextResponse.json({ error: "order_update_failed" }, { status: 500 });
  }
  if (!updatedOrder) {
    return NextResponse.json({ error: "not_updated" }, { status: 409 });
  }

  const { data: items } = (await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", id)) as { data: OrderItemRow[] | null; error: unknown };

  await finalizeOrderPayment(supabase, updatedOrder, items ?? []);

  return NextResponse.json({ orderId: updatedOrder.id });
}
