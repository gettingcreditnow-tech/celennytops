import { useTranslations } from "next-intl";
import { Link } from "../../../i18n/routing";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function SiteHeader() {
  const t = useTranslations("nav");
  return (
    <header className="relative flex items-center justify-end px-6 py-4 font-script text-2xl">
      <Link href="/" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <img src="/logo.png" alt="Celenny tops" className="h-20 w-auto" />
      </Link>
      <nav className="flex items-center gap-4 text-base font-body">
        <Link href="/catalog">{t("catalog")}</Link>
        <Link href="/cart">{t("cart")}</Link>
        <LanguageSwitcher />
      </nav>
    </header>
  );
}
