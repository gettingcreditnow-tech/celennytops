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
