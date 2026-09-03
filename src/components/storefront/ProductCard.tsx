import { useTranslations } from "next-intl";
import { Link } from "../../../i18n/routing";
import { formatUsd } from "@/lib/pricing";
import type { ProductWithVariants } from "@/lib/products";

export function ProductCard({
  product,
  locale,
}: {
  product: ProductWithVariants;
  locale: "es" | "en";
}) {
  const t = useTranslations("product");
  const name = locale === "es" ? product.nameEs : product.nameEn;
  const inStockVariants = product.variants.filter((v) => v.stock > 0);
  const soldOut = inStockVariants.length === 0;
  const lowestPrice = Math.min(...product.variants.map((v) => v.priceCents));

  return (
    <Link href={`/product/${product.id}`} className="block">
      <img src={product.images[0] ?? "/placeholder.jpg"} alt={name} />
      <h3>{name}</h3>
      <p>{formatUsd(lowestPrice)}</p>
      {soldOut && <span>{t("outOfStock")}</span>}
    </Link>
  );
}
