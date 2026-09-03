import { computeSubtotalCents, computeTotalCents } from "./pricing";

export async function getPayPalAccessToken(): Promise<string> {
  const base = process.env.PAYPAL_API_BASE!;
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID!;
  const secret = process.env.PAYPAL_CLIENT_SECRET!;
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  return data.access_token;
}

export async function createPayPalOrder(
  totalCents: number,
  currency: string
): Promise<{ id: string }> {
  const base = process.env.PAYPAL_API_BASE!;
  const token = await getPayPalAccessToken();
  const res = await fetch(`${base}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        { amount: { currency_code: currency, value: (totalCents / 100).toFixed(2) } },
      ],
    }),
  });
  return res.json();
}

export async function capturePayPalOrder(paypalOrderId: string): Promise<any> {
  const base = process.env.PAYPAL_API_BASE!;
  const token = await getPayPalAccessToken();
  const res = await fetch(`${base}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  return res.json();
}

type VariantRow = { id: string; price_cents: number; stock: number };
type CartLine = { variantId: string; quantity: number };
type Customer = { name: string; email: string; address: string; city: string; countryCode: string };

export function buildOrderRecord({
  items,
  variants,
  zone,
  customer,
  locale,
  paypalOrderId,
}: {
  items: CartLine[];
  variants: VariantRow[];
  zone: { id: string; rateCents: number };
  customer: Customer;
  locale: "es" | "en";
  paypalOrderId: string;
}) {
  const lines = items.map((i) => {
    const variant = variants.find((v) => v.id === i.variantId);
    if (!variant) throw new Error(`variant ${i.variantId} not found`);
    return { variantId: i.variantId, quantity: i.quantity, unitPriceCents: variant.price_cents };
  });
  const subtotalCents = computeSubtotalCents(
    lines.map((l) => ({ unitPriceCents: l.unitPriceCents, quantity: l.quantity }))
  );
  const totalCents = computeTotalCents(subtotalCents, zone.rateCents);

  return {
    order: {
      customer_name: customer.name,
      customer_email: customer.email,
      address_line: customer.address,
      city: customer.city,
      country_code: customer.countryCode,
      shipping_zone_id: zone.id,
      status: "paid" as const,
      subtotal_cents: subtotalCents,
      shipping_cents: zone.rateCents,
      total_cents: totalCents,
      locale,
      paypal_order_id: paypalOrderId,
    },
    items: lines.map((l) => ({
      variant_id: l.variantId,
      quantity: l.quantity,
      unit_price_cents: l.unitPriceCents,
    })),
  };
}
