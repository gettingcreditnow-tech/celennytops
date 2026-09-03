import Link from "next/link";

export function AdminNav() {
  return (
    <nav className="flex gap-4 border-b px-6 py-4">
      <Link href="/admin/products">Productos</Link>
      <Link href="/admin/orders">Pedidos</Link>
      <Link href="/admin/shipping-zones">Envio</Link>
    </nav>
  );
}
