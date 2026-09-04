"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const ACCOUNTS = [
  { bank: "BHD", number: "33126420012" },
  { bank: "Banreservas", number: "9605666479" },
  { bank: "Qik", number: "1006892608" },
];
const ACCOUNT_HOLDER = "Celenny Caraballo";
const ACCOUNT_HOLDER_ID = "402-0399758-6";

export function BankTransferPayment({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (proof: File) => Promise<void>;
}) {
  const t = useTranslations("checkout.bankTransfer");
  const [proof, setProof] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!proof) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(proof);
    } catch {
      setError(t("error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 border-t pt-6">
      <h2 className="font-script text-2xl">{t("title")}</h2>
      <ul className="mt-2 text-sm">
        {ACCOUNTS.map((a) => (
          <li key={a.bank}>
            {a.bank}: {a.number}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm">
        {t("holder")}: {ACCOUNT_HOLDER} — {t("holderId")}: {ACCOUNT_HOLDER_ID}
      </p>
      <p className="mt-2">{t("instructions")}</p>
      <input type="file" accept="image/*" onChange={(e) => setProof(e.target.files?.[0] ?? null)} className="mt-3" />
      {error && (
        <p role="alert" className="mt-2 text-red-600">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={disabled || !proof || submitting}
        onClick={handleSubmit}
        className="mt-3 rounded-full bg-brand-crimson px-6 py-2 text-white disabled:opacity-40"
      >
        {t("submit")}
      </button>
    </div>
  );
}
