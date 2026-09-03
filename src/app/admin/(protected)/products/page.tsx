import { createServerSupabaseClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function AdminProductsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: products } = await supabase.from("products").select("*").order("created_at", { ascending: false });

  return (
    <main className="px-6 py-6">
      <Link href="/admin/products/new">+ Nuevo producto</Link>
      <ul className="mt-4">
        {(products ?? []).map((p) => (
          <li key={p.id}>
            <Link href={`/admin/products/${p.id}`}>{p.name_es}</Link> {p.is_active ? "" : "(inactivo)"}
          </li>
        ))}
      </ul>
    </main>
  );
}
