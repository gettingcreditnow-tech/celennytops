import { useTranslations } from "next-intl";

export default function ConfirmationPage() {
  const t = useTranslations("confirmation");
  return (
    <main className="px-6 py-16 text-center">
      <h1 className="font-script text-3xl">{t("title")}</h1>
      <p>{t("body")}</p>
    </main>
  );
}
