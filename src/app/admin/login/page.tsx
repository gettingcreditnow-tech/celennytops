"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/admin/products");
  }

  return (
    <main className="mx-auto mt-20 max-w-sm px-6">
      <h1 className="font-script text-3xl">Celenny tops admin</h1>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-red-600">{error}</p>}
        <button type="submit" className="rounded-full bg-brand-crimson px-6 py-2 text-white">
          Entrar
        </button>
      </form>
    </main>
  );
}
