"use client";

import { useTranslations } from "next-intl";
import { useCart } from "@/context/CartContext";
import { computeSubtotalCents, formatDop } from "@/lib/pricing";

export function CartDrawer() {
  const t = useTranslations("cart");
  const { state, removeItem, setQuantity } = useCart();

  if (state.items.length === 0) {
    return <p>{t("empty")}</p>;
  }

  const subtotal = computeSubtotalCents(state.items);

  return (
    <div>
      <h2>{t("title")}</h2>
      <ul>
        {state.items.map((item) => (
          <li key={item.variantId}>
            <span>{item.name}</span>
            <input
              type="number"
              min={0}
              max={item.maxStock}
              value={item.quantity}
              onChange={(e) => setQuantity(item.variantId, Number(e.target.value))}
              aria-label={`quantity-${item.variantId}`}
            />
            <span>RD${formatDop(item.unitPriceCents * item.quantity)}</span>
            <button onClick={() => removeItem(item.variantId)}>x</button>
          </li>
        ))}
      </ul>
      <p>
        {t("subtotal")}: RD${formatDop(subtotal)}
      </p>
    </div>
  );
}
