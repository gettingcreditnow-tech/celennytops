import Link from "next/link";
import { formatUsd } from "@/lib/pricing";
import type { OrderRow } from "@/lib/types";

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr><th>Cliente</th><th>Total</th><th>Estado</th><th></th></tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id}>
            <td>{o.customer_name}</td>
            <td>{formatUsd(o.total_cents)}</td>
            <td>{o.status}</td>
            <td><Link href={`/admin/orders/${o.id}`}>Ver</Link></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
