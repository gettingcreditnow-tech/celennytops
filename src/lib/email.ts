import { Resend } from "resend";
import { formatUsd } from "./pricing";
import type { OrderRow } from "./types";

// Constructed lazily (not at module scope) because `new Resend(...)` throws
// synchronously when RESEND_API_KEY is unset, which would otherwise crash
// this whole module on import - including the pure `buildOrderConfirmationEmail`
// helper - in any environment (e.g. tests, local dev) without the key configured.
// Must be a domain verified in the Resend account, or every send is rejected.
const FROM_ADDRESS = "Celenny tops <orders@celennytops.com>";

let resendClient: Resend | null = null;
function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

// capture-order/route.ts passes the raw `orders` row straight through, so these
// inputs are slices of the shared OrderRow type rather than parallel shapes.
export type OrderConfirmationInput = Pick<
  OrderRow,
  | "id"
  | "customer_email"
  | "customer_name"
  | "address_line"
  | "city"
  | "country_code"
  | "subtotal_cents"
  | "shipping_cents"
  | "total_cents"
  | "locale"
  | "created_at"
>;

export type OrderConfirmationItem = {
  quantity: number;
  unitPriceCents: number;
  size: string | null;
  color: string | null;
  productNameEs: string | null;
  productNameEn: string | null;
  /** Absolute URL, or a /public-relative path (e.g. seeded product photos) - email clients fetch images directly, so a relative path is resolved against SITE_ORIGIN. */
  image: string | null;
};

export type AdminNewOrderInput = Pick<OrderRow, "id" | "customer_name" | "total_cents">;

const SITE_ORIGIN = "https://celennytops.com";

function absoluteImageUrl(image: string): string {
  return image.startsWith("http") ? image : `${SITE_ORIGIN}${image}`;
}

function orderConfirmationItemsHtml(items: OrderConfirmationItem[], isEs: boolean): string {
  if (items.length === 0) return "";
  const rows = items
    .map((item) => {
      const name = (isEs ? item.productNameEs : item.productNameEn) ?? "";
      const details = [item.size, item.color].filter(Boolean).join(" — ");
      const img = item.image
        ? `<img src="${absoluteImageUrl(item.image)}" alt="${name}" width="64" height="64" style="border-radius:8px;object-fit:cover;" />`
        : "";
      return (
        `<tr>` +
        `<td style="padding:8px 8px 8px 0;">${img}</td>` +
        `<td style="padding:8px 0;">${name}<br/><span style="color:#888;font-size:13px;">${details} · x${item.quantity}</span></td>` +
        `<td style="padding:8px 0;text-align:right;white-space:nowrap;">$${formatUsd(item.unitPriceCents * item.quantity)} USD</td>` +
        `</tr>`
      );
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse;margin-top:16px;">${rows}</table>`;
}

function formatOrderDate(createdAt: string, isEs: boolean): string {
  return new Date(createdAt).toLocaleDateString(isEs ? "es-DO" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const SUMMARY_LABELS = {
  es: {
    orderNumber: "Numero de pedido",
    orderDate: "Fecha del pedido",
    summary: "Resumen del pedido",
    subtotal: "Subtotal",
    shipping: "Envio",
    total: "Total",
    shipTo: "Direccion de envio",
  },
  en: {
    orderNumber: "Order number",
    orderDate: "Order date",
    summary: "Order summary",
    subtotal: "Subtotal",
    shipping: "Shipping",
    total: "Total",
    shipTo: "Shipping address",
  },
};

export function buildOrderConfirmationEmail(order: OrderConfirmationInput, items: OrderConfirmationItem[] = []) {
  const isEs = order.locale === "es";
  const l = SUMMARY_LABELS[isEs ? "es" : "en"];
  const itemsHtml = orderConfirmationItemsHtml(items, isEs);
  const greeting = isEs
    ? `<p>Hola ${order.customer_name}, gracias por tu compra.</p>`
    : `<p>Hi ${order.customer_name}, thank you for your order.</p>`;

  const meta =
    `<table style="width:100%;margin-top:16px;font-size:14px;color:#555;">` +
    `<tr><td>${l.orderNumber}</td><td style="text-align:right;">${order.id}</td></tr>` +
    `<tr><td>${l.orderDate}</td><td style="text-align:right;">${formatOrderDate(order.created_at, isEs)}</td></tr>` +
    `</table>`;

  const hr = `<hr style="margin:16px 0;border:none;border-top:1px solid #eee;" />`;

  const summary =
    `<h3 style="margin:0 0 8px;">${l.summary}</h3>` +
    `<table style="width:100%;font-size:14px;">` +
    `<tr><td>${l.subtotal}</td><td style="text-align:right;">$${formatUsd(order.subtotal_cents)} USD</td></tr>` +
    `<tr><td>${l.shipping}</td><td style="text-align:right;">$${formatUsd(order.shipping_cents)} USD</td></tr>` +
    `<tr><td style="font-weight:bold;padding-top:8px;">${l.total}</td><td style="text-align:right;font-weight:bold;padding-top:8px;">$${formatUsd(order.total_cents)} USD</td></tr>` +
    `</table>`;

  const shipTo =
    `<h3 style="margin:0 0 8px;">${l.shipTo}</h3>` +
    `<p style="margin:0;">${order.customer_name}<br/>${order.address_line}<br/>${order.city}, ${order.country_code}</p>`;

  return {
    to: order.customer_email,
    subject: isEs ? "Confirmacion de tu pedido - Celenny tops" : "Your order confirmation - Celenny tops",
    html: `${greeting}${itemsHtml}${meta}${hr}${summary}${hr}${shipTo}`,
  };
}

export async function sendOrderConfirmationEmail(
  order: OrderConfirmationInput,
  items: OrderConfirmationItem[] = []
): Promise<void> {
  const email = buildOrderConfirmationEmail(order, items);
  await getResendClient().emails.send({ from: FROM_ADDRESS, ...email });
}

export async function sendAdminNewOrderEmail(
  order: AdminNewOrderInput,
  options?: { note?: string }
): Promise<void> {
  const noteHtml = options?.note ? `<p>${options.note}</p>` : "";
  await getResendClient().emails.send({
    from: FROM_ADDRESS,
    to: process.env.ORDER_NOTIFICATION_EMAIL!,
    subject: `Nuevo pedido de ${order.customer_name}`,
    html: `<p>Pedido ${order.id} por $${formatUsd(order.total_cents)} USD.</p>${noteHtml}`,
  });
}

export type PaymentIssueInput = {
  orderId: OrderRow["id"];
  paypalOrderId: string;
  /** Why the capture was not accepted. */
  reason: "amount_mismatch" | "payment_not_completed";
  /** What the order says it should cost, in cents. */
  expectedCents: OrderRow["total_cents"];
  /** What PayPal reported capturing, as the raw PayPal amount string. */
  capturedValue: string | null;
};

export function buildPaymentIssueEmail(issue: PaymentIssueInput) {
  return {
    subject: `REVISAR pago del pedido ${issue.orderId} (${issue.reason})`,
    html:
      `<p>El pedido <strong>${issue.orderId}</strong> sigue en <em>pending</em> ` +
      `porque su cobro en PayPal no se pudo aceptar (${issue.reason}).</p>` +
      `<p>Pedido PayPal: ${issue.paypalOrderId}<br />` +
      `Esperado: $${formatUsd(issue.expectedCents)} USD<br />` +
      `Cobrado: ${issue.capturedValue === null ? "ninguno" : `$${issue.capturedValue} USD`}</p>` +
      `<p>Revisa este pago manualmente en PayPal antes de enviar nada.</p>`,
  };
}

/**
 * Alerts the shop inbox when money may have moved but the order could not be
 * marked paid. Without this the customer sees an error and nobody else ever
 * learns the order needs manual review.
 */
export async function sendAdminPaymentIssueEmail(issue: PaymentIssueInput): Promise<void> {
  const email = buildPaymentIssueEmail(issue);
  await getResendClient().emails.send({
    from: FROM_ADDRESS,
    to: process.env.ORDER_NOTIFICATION_EMAIL!,
    ...email,
  });
}
