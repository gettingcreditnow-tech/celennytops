import { createServerSupabaseClient } from "@/lib/supabase/server";
import { OrdersTable } from "@/components/admin/OrdersTable";

export default async function AdminOrdersPage() {
  const supabase = await createServerSupabaseClient();
  const { data: orders } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
  return (
    <main className="px-6 py-6">
      <OrdersTable orders={orders ?? []} />
    </main>
  );
}
