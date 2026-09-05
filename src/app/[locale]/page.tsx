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

async function getFreeShippingBannerSettings(): Promise<{ minQuantity: number; enabled: boolean } | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("store_settings")
    .select("free_shipping_min_quantity, show_free_shipping_banner")
    .maybeSingle();
  if (!data) return null;
  return { minQuantity: data.free_shipping_min_quantity, enabled: data.show_free_shipping_banner };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: "es" | "en" }>;
}) {
  const { locale } = await params;
  const [t, products, freeShippingBanner] = await Promise.all([
    getTranslations("home"),
    listActiveProducts(),
    getFreeShippingBannerSettings(),
  ]);
  const categories = groupByCategory(products);

  return (
    <main className="px-6 py-10">
      <h1 className="font-script text-center text-4xl">{t("tagline")}</h1>
      {freeShippingBanner?.enabled && (
        <div className="mt-4 flex justify-center">
          <p className="rounded-full bg-brand-crimson px-6 py-2 text-center text-lg font-bold text-white shadow-md">
            🚚 {t("freeShippingBanner", { count: freeShippingBanner.minQuantity })}
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
