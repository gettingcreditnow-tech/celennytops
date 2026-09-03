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
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2 font-script text-2xl sm:px-6">
      <div />
      <Link href="/" className="flex justify-center">
        <img src="/logo.png" alt="Celenny tops" className="h-14 w-auto sm:h-20" />
      </Link>
      <nav className="flex items-center justify-end gap-2 text-sm font-body sm:gap-4 sm:text-base">
        <Link href="/catalog">{t("catalog")}</Link>
        <Link href="/cart" className="relative mr-1.5">
          {t("cart")}
          {itemCount > 0 && (
            <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-crimson text-xs text-white">
              {itemCount}
            </span>
          )}
        </Link>
        <LanguageSwitcher />
      </nav>
    </header>
  );
}
