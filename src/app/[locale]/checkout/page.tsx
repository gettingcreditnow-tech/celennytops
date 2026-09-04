"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { useCart } from "@/context/CartContext";
import { computeSubtotalCents, computeTotalCents, formatUsd } from "@/lib/pricing";
import { getShippingZoneForCountry } from "@/lib/shipping";
import type { ShippingZone } from "@/lib/types";
import { useRouter } from "../../../../i18n/routing";

export default function CheckoutPage() {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const { state, clear } = useCart();
  const router = useRouter();
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    address: "",
    city: "",
    countryCode: "",
  });

  useEffect(() => {
    fetch("/api/shipping-zones")
      .then((r) => r.json())
      .then(setZones);
  }, []);

  const subtotal = computeSubtotalCents(state.items);
  const isDO = form.countryCode.toUpperCase() === "DO";
  const zone = form.countryCode
    ? getShippingZoneForCountry(form.countryCode, zones, isDO ? form.city : undefined)
    : null;
  const shipping = zone?.rateCents ?? 0;
  const total = computeTotalCents(subtotal, shipping);
  const doSectors = zones.filter((z) => z.countryCodes.includes("DO") && z.sector);

  return (
    <main className="px-6 py-10">
      <h1 className="font-script text-3xl">{t("title")}</h1>
      <form className="mt-6 flex max-w-md flex-col gap-3">
        <input placeholder={t("name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder={t("email")} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder={t("address")} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        {isDO ? (
          <select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
            <option value="">{t("city")}</option>
            {doSectors.map((z) => (
              <option key={z.id} value={z.sector!}>
                {z.sector} — ${formatUsd(z.rateCents)}
              </option>
            ))}
          </select>
        ) : (
          <input placeholder={t("city")} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        )}
        <input
          placeholder={t("country")}
          value={form.countryCode}
          onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase(), city: "" })}
          maxLength={2}
        />
      </form>
      <div className="mt-6">
        <p>
          {t("shipping")}
          {zone?.sector ? " (VIMENPAQ)" : ""}: ${formatUsd(shipping)}
        </p>
        <p>{t("total")}: ${formatUsd(total)}</p>
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
    </main>
  );
}
