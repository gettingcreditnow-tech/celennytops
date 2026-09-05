"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { formatUsd } from "@/lib/pricing";
import type { OrderItemRow, OrderRow, ProductVariant } from "@/lib/types";

/** order_items rows joined with their variant, as selected below. */
type OrderItemWithVariant = OrderItemRow & {
  product_variants: { sku: ProductVariant["sku"] } | null;
};

export default function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemWithVariant[]>([]);
  const [tracking, setTracking] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    params.then((p) => {
      if (cancelled) return;
      setId(p.id);
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  useEffect(() => {
    if (!id) return;
    const supabase = createBrowserSupabaseClient();
    supabase.from("orders").select("*").eq("id", id).single().then(({ data }) => {
      setOrder(data);
      setTracking(data?.tracking_number ?? "");
    });
    supabase.from("order_items").select("*, product_variants(*)").eq("order_id", id).then(({ data }) => setItems(data ?? []));
  }, [id]);

  useEffect(() => {
    if (!order?.payment_proof_path) return;
    const supabase = createBrowserSupabaseClient();
    supabase.storage
      .from("payment-proofs")
      .createSignedUrl(order.payment_proof_path, 300)
      .then(({ data }) => setProofUrl(data?.signedUrl ?? null));
  }, [order?.payment_proof_path]);

  async function markShipped() {
    if (!id || !order) return;
    const supabase = createBrowserSupabaseClient();
    await supabase.from("orders").update({ status: "shipped", tracking_number: tracking }).eq("id", id);
    setOrder({ ...order, status: "shipped", tracking_number: tracking });
  }

  async function markPaid() {
    if (!id || !order) return;
    setMarkingPaid(true);
    try {
      const res = await fetch(`/api/admin/orders/${id}/mark-paid`, { method: "POST" });
      if (res.ok) {
        setOrder({ ...order, status: "paid" });
      }
    } finally {
      setMarkingPaid(false);
    }
  }

  if (!order) return null;

  return (
    <main className="px-6 py-6">
      <h1>{order.customer_name} — {order.customer_email}</h1>
      <p>Telefono: {order.customer_phone || "(no registrado)"}</p>
      <p>{order.address_line}, {order.city}, {order.country_code}</p>
      <p>Estado: {order.status}</p>
      <p>Metodo de pago: {order.payment_method === "bank_transfer" ? "Deposito bancario" : "PayPal"}</p>
      {proofUrl && <img src={proofUrl} alt="Comprobante de pago" className="mt-2 max-w-xs" />}
      <ul>
        {items.map((i) => (
          <li key={i.id}>{i.quantity} x {i.product_variants?.sku} — ${formatUsd(i.unit_price_cents * i.quantity)}</li>
        ))}
      </ul>
      <p>Total: ${formatUsd(order.total_cents)}</p>
      {order.payment_method === "bank_transfer" && order.status === "pending" && (
        <button onClick={markPaid} disabled={markingPaid}>
          {markingPaid ? "Marcando..." : "Marcar como pagado"}
        </button>
      )}
      <input placeholder="Numero de seguimiento" value={tracking} onChange={(e) => setTracking(e.target.value)} />
      <button onClick={markShipped} disabled={order.status === "pending"}>
        Marcar como enviado
      </button>
    </main>
  );
}
