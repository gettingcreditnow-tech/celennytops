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
  const [justAdded, setJustAdded] = useState(false);

  function handleAddToCart() {
    if (!selected) return;
    onAddToCart(selected);
    // Without this, clicking gives no visible sign it worked, so an
    // impatient shopper clicks again and ends up with a bigger quantity
    // than they meant to add.
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 400);
  }

  return (
    <div>
      <div className="flex gap-2">
        {product.variants.map((v) => (
          <button
            key={v.id}
            disabled={v.stock === 0}
            onClick={() => {
              setSelected(v);
              setJustAdded(false);
            }}
            aria-pressed={selected?.id === v.id}
            className={`border px-3 py-1 disabled:opacity-40 ${
              selected?.id === v.id
                ? "border-brand-crimson bg-brand-crimson text-white"
                : "border-brand-crimson/40"
            }`}
          >
            {v.size ?? v.color}
          </button>
        ))}
      </div>
      <button
        disabled={!selected || justAdded}
        onClick={handleAddToCart}
        className="mt-4 rounded-full bg-brand-crimson px-6 py-2 text-white disabled:opacity-40"
      >
        {justAdded ? t("added") : t("addToCart")}
      </button>
    </div>
  );
}
