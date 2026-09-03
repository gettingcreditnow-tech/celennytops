"use client";

import { usePathname, useRouter } from "../../../i18n/routing";
import { useLocale } from "next-intl";

export function LanguageSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const other = locale === "es" ? "en" : "es";

  return (
    <button
      onClick={() => router.replace(pathname, { locale: other })}
      className="text-sm font-semibold uppercase"
    >
      {other}
    </button>
  );
}
