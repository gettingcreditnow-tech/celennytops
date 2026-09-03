import { Resend } from "resend";
import { formatUsd } from "./pricing";

// Constructed lazily (not at module scope) because `new Resend(...)` throws
// synchronously when RESEND_API_KEY is unset, which would otherwise crash
// this whole module on import - including the pure `buildOrderConfirmationEmail`
// helper - in any environment (e.g. tests, local dev) without the key configured.
let resendClient: Resend | null = null;
function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

// These mirror the relevant columns of the `orders` table (snake_case), not
// the camelCase `Order` type in `src/lib/types.ts` — capture-order/route.ts
// passes the raw Supabase row straight through to these functions.
type OrderConfirmationInput = {
  customer_email: string;
  customer_name: string;
  total_cents: number;
  locale: "es" | "en";
};

type AdminNewOrderInput = {
  id: string;
  customer_name: string;
  total_cents: number;
};

export function buildOrderConfirmationEmail(order: OrderConfirmationInput) {
  const isEs = order.locale === "es";
  return {
    to: order.customer_email,
    subject: isEs ? "Confirmacion de tu pedido - Celenny tops" : "Your order confirmation - Celenny tops",
    html: isEs
      ? `<p>Hola ${order.customer_name}, gracias por tu compra. Total: $${formatUsd(order.total_cents)} USD.</p>`
      : `<p>Hi ${order.customer_name}, thank you for your order. Total: $${formatUsd(order.total_cents)} USD.</p>`,
  };
}

export async function sendOrderConfirmationEmail(order: OrderConfirmationInput): Promise<void> {
  const email = buildOrderConfirmationEmail(order);
  await getResendClient().emails.send({ from: "Celenny tops <orders@celennytops.com>", ...email });
}

export async function sendAdminNewOrderEmail(order: AdminNewOrderInput): Promise<void> {
  await getResendClient().emails.send({
    from: "Celenny tops <orders@celennytops.com>",
    to: process.env.ORDER_NOTIFICATION_EMAIL!,
    subject: `Nuevo pedido de ${order.customer_name}`,
    html: `<p>Pedido ${order.id} por $${formatUsd(order.total_cents)} USD.</p>`,
  });
}
