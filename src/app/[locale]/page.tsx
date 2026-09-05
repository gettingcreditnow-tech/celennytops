import { getTranslations } from "next-intl/server";
import { listActiveProducts, type ProductWithVariants } from "@/lib/products";
import { ProductGrid } from "@/components/storefront/ProductGrid";

function groupByCategory(products: ProductWithVariants[]): [string, ProductWithVariants[]][] {
  const groups = new Map<string, ProductWithVariants[]>();
  for (const product of products) {
    const category = product.category || "Otros";
    const group = groups.get(category);
    if (group) {
      group.push(product);
    } else {
      groups.set(category, [product]);
    }
  }
  return Array.from(groups.entries());
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: "es" | "en" }>;
}) {
  const { locale } = await params;
  const [t, products] = await Promise.all([getTranslations("home"), listActiveProducts()]);
  const categories = groupByCategory(products);

  return (
    <main className="px-6 py-10">
      <h1 className="font-script text-center text-4xl">{t("tagline")}</h1>
      {categories.map(([category, categoryProducts]) => (
        <section key={category} className="mt-10">
          <h2 className="font-script text-2xl">{category}</h2>
          <div className="mt-4">
            <ProductGrid products={categoryProducts} locale={locale} />
          </div>
        </section>
      ))}
    </main>
  );
}
