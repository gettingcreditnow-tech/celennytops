import { useTranslations } from "next-intl";
import { Link } from "../../../i18n/routing";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function SiteHeader() {
  const t = useTranslations("nav");
  return (
    <header className="flex items-center justify-between px-6 py-4 font-script text-2xl">
      <Link href="/">Celenny tops</Link>
      <nav className="flex items-center gap-4 text-base font-body">
        <Link href="/catalog">{t("catalog")}</Link>
        <Link href="/cart">{t("cart")}</Link>
        <LanguageSwitcher />
      </nav>
    </header>
  );
}
