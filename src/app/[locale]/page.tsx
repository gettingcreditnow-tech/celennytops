import { useTranslations } from "next-intl";
import { Link } from "../../../i18n/routing";

export default function HomePage() {
  const t = useTranslations("home");
  return (
    <main className="px-6 py-16 text-center">
      <h1 className="font-script text-4xl">{t("tagline")}</h1>
      <Link href="/catalog" className="mt-6 inline-block rounded-full bg-brand-crimson px-6 py-3 text-white">
        {t("cta")}
      </Link>
    </main>
  );
}
