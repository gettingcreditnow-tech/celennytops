import { ProductCard } from "./ProductCard";
import type { ProductWithVariants } from "@/lib/products";

export function ProductGrid({
  products,
  locale,
}: {
  products: ProductWithVariants[];
  locale: "es" | "en";
}) {
  return (
    <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} locale={locale} />
      ))}
    </div>
  );
}
