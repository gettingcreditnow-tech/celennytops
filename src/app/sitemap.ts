import type { MetadataRoute } from "next";
import { listActiveProducts } from "@/lib/products";

const BASE_URL = "https://celennytops.com";
const LOCALES = ["es", "en"] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await listActiveProducts();

  const homeRoutes: MetadataRoute.Sitemap = LOCALES.map((locale) => ({
    url: `${BASE_URL}/${locale}`,
    lastModified: new Date(),
  }));

  const productRoutes: MetadataRoute.Sitemap = products.flatMap((product) =>
    LOCALES.map((locale) => ({
      url: `${BASE_URL}/${locale}/product/${product.id}`,
      lastModified: new Date(),
    }))
  );

  return [...homeRoutes, ...productRoutes];
}
