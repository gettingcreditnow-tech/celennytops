"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

function ConfirmationContent() {
  const t = useTranslations("confirmation");
  const searchParams = useSearchParams();
  const isBankTransfer = searchParams.get("method") === "bank_transfer";

  return (
    <main className="px-6 py-16 text-center">
      <h1 className="font-script text-3xl">{isBankTransfer ? t("pendingTitle") : t("title")}</h1>
      <p>{isBankTransfer ? t("pendingBody") : t("body")}</p>
    </main>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmationContent />
    </Suspense>
  );
}
