import { listActiveProducts } from "@/lib/products";
import { ProductGrid } from "@/components/storefront/ProductGrid";

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ locale: "es" | "en" }>;
}) {
  const { locale } = await params;
  const products = await listActiveProducts();
  return (
    <main className="px-6 py-10">
      <ProductGrid products={products} locale={locale} />
    </main>
  );
}
