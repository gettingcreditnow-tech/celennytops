"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ProductVariant } from "@/lib/types";
import type { ProductWithVariants } from "@/lib/products";

export function VariantSelector({
  product,
  locale,
  onAddToCart,
}: {
  product: ProductWithVariants;
  locale: "es" | "en";
  onAddToCart: (variant: ProductVariant) => void;
}) {
  const t = useTranslations("product");
  const [selected, setSelected] = useState<ProductVariant | null>(null);

  return (
    <div>
      <div className="flex gap-2">
        {product.variants.map((v) => (
          <button
            key={v.id}
            disabled={v.stock === 0}
            onClick={() => setSelected(v)}
            aria-pressed={selected?.id === v.id}
            className="border px-3 py-1 disabled:opacity-40"
          >
            {v.size ?? v.color}
          </button>
        ))}
      </div>
      <button
        disabled={!selected}
        onClick={() => selected && onAddToCart(selected)}
        className="mt-4 rounded-full bg-brand-crimson px-6 py-2 text-white disabled:opacity-40"
      >
        {t("addToCart")}
      </button>
    </div>
  );
}
