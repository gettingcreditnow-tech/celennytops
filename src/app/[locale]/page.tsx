import { getTranslations } from "next-intl/server";
import { listActiveProducts, type ProductWithVariants } from "@/lib/products";
import { ProductGrid } from "@/components/storefront/ProductGrid";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

async function getFreeShippingMinQuantity(): Promise<number | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("store_settings").select("free_shipping_min_quantity").maybeSingle();
  return data?.free_shipping_min_quantity ?? null;
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: "es" | "en" }>;
}) {
  const { locale } = await params;
  const [t, products, freeShippingMinQuantity] = await Promise.all([
    getTranslations("home"),
    listActiveProducts(),
    getFreeShippingMinQuantity(),
  ]);
  const categories = groupByCategory(products);

  return (
    <main className="px-6 py-10">
      <h1 className="font-script text-center text-4xl">{t("tagline")}</h1>
      {freeShippingMinQuantity !== null && (
        <div className="mt-4 flex justify-center">
          <p className="animate-fade-cycle rounded-full bg-brand-crimson px-6 py-2 text-center text-lg font-bold text-white shadow-md">
            🚚 {t("freeShippingBanner", { count: freeShippingMinQuantity })}
          </p>
        </div>
      )}
      {categories.map(([category, categoryProducts]) => (
        <section key={category} className="mt-10">
          <h2 className="text-lg font-semibold uppercase tracking-wide text-brand-crimson">{category}</h2>
          <div className="mt-4">
            <ProductGrid products={categoryProducts} locale={locale} />
          </div>
        </section>
      ))}
    </main>
  );
}
