import { useTranslations } from "next-intl";
import { Link } from "../../../i18n/routing";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function SiteHeader() {
  const t = useTranslations("nav");
  return (
    <header className="grid grid-cols-3 items-center px-6 py-2 font-script text-2xl">
      <div />
      <Link href="/" className="flex justify-center">
        <img src="/logo.png" alt="Celenny tops" className="h-20 w-auto" />
      </Link>
      <nav className="flex items-center justify-end gap-4 text-base font-body">
        <Link href="/catalog">{t("catalog")}</Link>
        <Link href="/cart">{t("cart")}</Link>
        <LanguageSwitcher />
      </nav>
    </header>
  );
}
