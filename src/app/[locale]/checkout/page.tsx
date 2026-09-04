"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { useCart } from "@/context/CartContext";
import { computeSubtotalCents, computeTotalCents, formatDop } from "@/lib/pricing";
import { getShippingZoneForCountry } from "@/lib/shipping";
import type { ShippingZone } from "@/lib/types";
import { useRouter } from "../../../../i18n/routing";
import { BankTransferPayment } from "@/components/storefront/BankTransferPayment";

export default function CheckoutPage() {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const { state, clear } = useCart();
  const router = useRouter();
  const [zones, setZones] = useState<ShippingZone[]>([]);
  // Only Dominican Republic (Santo Domingo sectors) ships for now - see
  // the shipping/bank-transfer plan. countryCode is fixed rather than a
  // free-text field so a customer can't select a destination we don't
  // actually serve.
  const [form, setForm] = useState({
    name: "",
    email: "",
    address: "",
    city: "",
    countryCode: "DO",
  });

  useEffect(() => {
    fetch("/api/shipping-zones")
      .then((r) => r.json())
      .then(setZones);
  }, []);

  const subtotal = computeSubtotalCents(state.items);
  const zone = getShippingZoneForCountry(form.countryCode, zones, form.city || undefined);
  const shipping = zone?.rateCents ?? 0;
  const total = computeTotalCents(subtotal, shipping);
  const doSectors = zones.filter((z) => z.countryCodes.includes("DO") && z.sector);

  async function submitBankTransfer(proof: File) {
    const formData = new FormData();
    formData.set(
      "items",
      JSON.stringify(state.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })))
    );
    formData.set(
      "customer",
      JSON.stringify({
        name: form.name,
        email: form.email,
        address: form.address,
        city: form.city,
        countryCode: form.countryCode,
      })
    );
    formData.set("locale", locale);
    formData.set("proof", proof);

    const res = await fetch("/api/bank-transfer/create-order", { method: "POST", body: formData });
    if (!res.ok) throw new Error("bank_transfer_failed");
    const result = await res.json();
    clear();
    router.push(`/checkout/confirmation/${result.orderId}?method=bank_transfer`);
  }

  return (
    <main className="px-6 py-10">
      <h1 className="font-script text-3xl">{t("title")}</h1>
      <form className="mt-6 flex max-w-md flex-col gap-3">
        <input placeholder={t("name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder={t("email")} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder={t("address")} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
          <option value="">{t("city")}</option>
          {doSectors.map((z) => (
            <option key={z.id} value={z.sector!}>
              {z.sector} — RD${formatDop(z.rateCents)}
            </option>
          ))}
        </select>
      </form>
      <div className="mt-6">
        <p>
          {t("shipping")}
          {zone?.sector ? " (VIMENPAQ)" : ""}: RD${formatDop(shipping)}
        </p>
        <p>{t("total")}: RD${formatDop(total)}</p>
      </div>
      <div className="mt-6">
        <PayPalScriptProvider
          options={{ clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID!, currency: "USD" }}
        >
          <PayPalButtons
            disabled={!zone || state.items.length === 0}
            createOrder={async () => {
              const res = await fetch("/api/paypal/create-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  items: state.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
                  customer: {
                    name: form.name,
                    email: form.email,
                    address: form.address,
                    city: form.city,
                    countryCode: form.countryCode,
                  },
                  locale,
                }),
              });
              const data = await res.json();
              return data.paypalOrderId;
            }}
            onApprove={async (data) => {
              const res = await fetch("/api/paypal/capture-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ paypalOrderId: data.orderID }),
              });
              const result = await res.json();
              if (result.orderId) {
                clear();
                router.push(`/checkout/confirmation/${result.orderId}`);
              }
            }}
          />
        </PayPalScriptProvider>
      </div>
      {zone?.sector && (
        <BankTransferPayment disabled={state.items.length === 0} onSubmit={submitBankTransfer} />
      )}
    </main>
  );
}
