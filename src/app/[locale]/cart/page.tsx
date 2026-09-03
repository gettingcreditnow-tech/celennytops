"use client";

import { useTranslations } from "next-intl";
import { Link } from "../../../../i18n/routing";
import { CartDrawer } from "@/components/storefront/CartDrawer";
import { useCart } from "@/context/CartContext";

export default function CartPage() {
  const t = useTranslations("cart");
  const { state } = useCart();

  return (
    <main className="px-6 py-10">
      <CartDrawer />
      {state.items.length > 0 && (
        <Link
          href="/checkout"
          className="mt-6 inline-block rounded-full bg-brand-crimson px-6 py-3 text-white"
        >
          {t("checkout")}
        </Link>
      )}
    </main>
  );
}
