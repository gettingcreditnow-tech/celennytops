"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatDop } from "@/lib/pricing";

type ConfirmationItem = {
  quantity: number;
  unitPriceCents: number;
  size: string | null;
  color: string | null;
  productNameEs: string | null;
  productNameEn: string | null;
  image: string | null;
};

type ConfirmationOrder = {
  id: string;
  customerName: string;
  addressLine: string;
  city: string;
  countryCode: string;
  status: string;
  paymentMethod: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  locale: "es" | "en";
};

function ConfirmationContent({ orderId }: { orderId: string }) {
  const t = useTranslations("confirmation");
  const searchParams = useSearchParams();
  const isBankTransfer = searchParams.get("method") === "bank_transfer";
  const [order, setOrder] = useState<ConfirmationOrder | null>(null);
  const [items, setItems] = useState<ConfirmationItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/orders/${orderId}/confirmation`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setOrder(data.order);
        setItems(data.items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const productName = (item: ConfirmationItem) =>
    (order?.locale === "en" ? item.productNameEn : item.productNameEs) ?? "";

  return (
    <main className="px-6 py-16 text-center">
      <h1 className="font-script text-3xl">{isBankTransfer ? t("pendingTitle") : t("title")}</h1>
      <p>{isBankTransfer ? t("pendingBody") : t("body")}</p>

      {order && (
        <div className="mx-auto mt-10 max-w-md text-left">
          <ul className="divide-y divide-brand-crimson/10">
            {items.map((item, idx) => (
              <li key={idx} className="flex items-center gap-3 py-3">
                {item.image && (
                  <img src={item.image} alt={productName(item)} className="h-16 w-16 rounded object-cover" />
                )}
                <div className="flex-1">
                  <p className="font-medium">{productName(item)}</p>
                  <p className="text-sm text-gray-600">
                    {[item.size, item.color].filter(Boolean).join(" — ")} · x{item.quantity}
                  </p>
                </div>
                <p>RD${formatDop(item.unitPriceCents * item.quantity)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-brand-crimson/10 pt-4 text-sm">
            <p>
              {t("shipTo")}: {order.addressLine}, {order.city}, {order.countryCode}
            </p>
            <p className="mt-2">
              {t("subtotal")}: RD${formatDop(order.subtotalCents)}
            </p>
            <p>
              {t("shipping")}: RD${formatDop(order.shippingCents)}
            </p>
            <p className="font-medium">
              {t("total")}: RD${formatDop(order.totalCents)}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

export default function ConfirmationPage({ params }: { params: Promise<{ orderId: string }> }) {
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    params.then((p) => {
      if (!cancelled) setOrderId(p.orderId);
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  if (!orderId) return null;

  return (
    <Suspense fallback={null}>
      <ConfirmationContent orderId={orderId} />
    </Suspense>
  );
}
