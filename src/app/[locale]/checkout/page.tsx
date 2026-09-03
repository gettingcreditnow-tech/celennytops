"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { useCart } from "@/context/CartContext";
import { computeSubtotalCents, computeTotalCents, formatUsd } from "@/lib/pricing";
import { getShippingZoneForCountry } from "@/lib/shipping";
import type { ShippingZone } from "@/lib/types";

export default function CheckoutPage() {
  const t = useTranslations("checkout");
  const { state } = useCart();
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
  const zone = form.countryCode ? getShippingZoneForCountry(form.countryCode, zones) : null;
  const shipping = zone?.rateCents ?? 0;
  const total = computeTotalCents(subtotal, shipping);

  return (
    <main className="px-6 py-10">
      <h1 className="font-script text-3xl">{t("title")}</h1>
      <form className="mt-6 flex max-w-md flex-col gap-3">
        <input placeholder={t("name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder={t("email")} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder={t("address")} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <input placeholder={t("city")} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <input
          placeholder={t("country")}
          value={form.countryCode}
          onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })}
          maxLength={2}
        />
      </form>
      <div className="mt-6">
        <p>{t("shipping")}: {formatUsd(shipping)}</p>
        <p>{t("total")}: {formatUsd(total)}</p>
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
                  countryCode: form.countryCode,
                }),
              });
              const data = await res.json();
              return data.paypalOrderId;
            }}
            onApprove={async () => {
              // capture handled in Task 12
            }}
          />
        </PayPalScriptProvider>
      </div>
    </main>
  );
}
