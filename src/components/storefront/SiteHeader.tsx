"use client";

import { useTranslations } from "next-intl";
import { Link } from "../../../i18n/routing";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useCart } from "@/context/CartContext";

export function SiteHeader() {
  const t = useTranslations("nav");
  const { state } = useCart();
  const itemCount = state.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <header className="grid grid-cols-3 items-center px-6 py-2 font-script text-2xl">
      <div />
      <Link href="/" className="flex justify-center">
        <img src="/logo.png" alt="Celenny tops" className="h-20 w-auto" />
      </Link>
      <nav className="flex items-center justify-end gap-4 text-base font-body">
        <Link href="/catalog">{t("catalog")}</Link>
        <Link href="/cart" className="relative">
          {t("cart")}
          {itemCount > 0 && (
            <span className="absolute -right-3 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-crimson text-xs text-white">
              {itemCount}
            </span>
          )}
        </Link>
        <LanguageSwitcher />
      </nav>
    </header>
  );
}
