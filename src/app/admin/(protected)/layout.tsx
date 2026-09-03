import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin/AdminNav";
import "../../globals.css";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  // The RLS policies added in 0002_admin_allowlist.sql already reject
  // non-allowlisted users at the database, but the UI must not depend on that
  // alone - without this check a signed-in non-admin would get the admin shell
  // with silently empty tables instead of a clear denial.
  const { data: adminRow } = await supabase
    .from("admin_emails")
    .select("email")
    .eq("email", (user.email ?? "").toLowerCase())
    .maybeSingle();

  if (!adminRow) {
    return (
      <html lang="es">
        <body>
          <main className="px-6 py-16 text-center">
            <h1 className="font-script text-3xl">Acceso denegado</h1>
            <p>Esta cuenta no tiene permisos de administrador.</p>
          </main>
        </body>
      </html>
    );
  }

  return (
    <html lang="es">
      <body>
        <AdminNav />
        {children}
      </body>
    </html>
  );
}
