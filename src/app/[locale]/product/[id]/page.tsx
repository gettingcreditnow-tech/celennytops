"use client";

import { useEffect, useState } from "react";
import type { ProductWithVariants } from "@/lib/products";
import { VariantSelector } from "@/components/storefront/VariantSelector";
import { useCart } from "@/context/CartContext";

export default function ProductPage({
  params,
}: {
  params: Promise<{ id: string; locale: "es" | "en" }>;
}) {
  const [id, setId] = useState<string | null>(null);
  const [locale, setLocale] = useState<"es" | "en">("es");
  const [product, setProduct] = useState<ProductWithVariants | null>(null);
  const { addItem } = useCart();

  useEffect(() => {
    let cancelled = false;
    params.then((p) => {
      if (cancelled) return;
      setId(p.id);
      setLocale(p.locale);
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/products/${id}`)
      .then((r) => r.json())
      .then(setProduct);
  }, [id]);

  if (!product) return null;
  const name = locale === "es" ? product.nameEs : product.nameEn;
  const description = locale === "es" ? product.descriptionEs : product.descriptionEn;

  return (
    <main className="px-6 py-10">
      <img src={product.images[0] ?? "/placeholder.jpg"} alt={name} />
      <h1 className="font-script text-3xl">{name}</h1>
      <p>{description}</p>
      <VariantSelector
        product={product}
        locale={locale}
        onAddToCart={(variant) =>
          addItem({
            variantId: variant.id,
            productId: product.id,
            name,
            size: variant.size,
            color: variant.color,
            unitPriceCents: variant.priceCents,
            quantity: 1,
            maxStock: variant.stock,
          })
        }
      />
    </main>
  );
}
