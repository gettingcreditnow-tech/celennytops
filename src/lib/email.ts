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
  "customer_email" | "customer_name" | "total_cents" | "locale"
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

export function buildOrderConfirmationEmail(order: OrderConfirmationInput, items: OrderConfirmationItem[] = []) {
  const isEs = order.locale === "es";
  const itemsHtml = orderConfirmationItemsHtml(items, isEs);
  return {
    to: order.customer_email,
    subject: isEs ? "Confirmacion de tu pedido - Celenny tops" : "Your order confirmation - Celenny tops",
    html: isEs
      ? `<p>Hola ${order.customer_name}, gracias por tu compra.</p>${itemsHtml}<p style="margin-top:16px;"><strong>Total: $${formatUsd(order.total_cents)} USD</strong></p>`
      : `<p>Hi ${order.customer_name}, thank you for your order.</p>${itemsHtml}<p style="margin-top:16px;"><strong>Total: $${formatUsd(order.total_cents)} USD</strong></p>`,
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
