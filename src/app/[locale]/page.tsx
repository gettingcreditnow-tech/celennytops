import { getTranslations } from "next-intl/server";
import { listActiveProducts } from "@/lib/products";
import { ProductGrid } from "@/components/storefront/ProductGrid";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: "es" | "en" }>;
}) {
  const { locale } = await params;
  const [t, products] = await Promise.all([getTranslations("home"), listActiveProducts()]);
  return (
    <main className="px-6 py-10">
      <h1 className="font-script text-center text-4xl">{t("tagline")}</h1>
      <div className="mt-10">
        <ProductGrid products={products} locale={locale} />
      </div>
    </main>
  );
}
