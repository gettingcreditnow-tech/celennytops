import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { buildOrderDraft, parseCartItems } from "@/lib/order-draft";
import { sendAdminNewOrderEmail } from "@/lib/email";

const MAX_PROOF_BYTES = 5 * 1024 * 1024;

function extensionFromMimeType(mimeType: string): string | null {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return null;
}

type CustomerInput = {
  name?: string;
  email?: string;
  address?: string;
  city?: string;
  countryCode?: string;
};

export async function POST(req: NextRequest) {
  const form = await req.formData();

  let items: unknown;
  let customer: CustomerInput;
  try {
    items = JSON.parse(String(form.get("items")));
    customer = JSON.parse(String(form.get("customer")));
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const locale = form.get("locale") === "en" ? "en" : "es";
  const proof = form.get("proof");

  const cartItems = parseCartItems(items);
  if (!cartItems) {
    return NextResponse.json({ error: "invalid_items" }, { status: 400 });
  }
  if (!customer?.countryCode || !customer?.name || !customer?.email || !customer?.address || !customer?.city) {
    return NextResponse.json({ error: "invalid_customer" }, { status: 400 });
  }
  if (customer.countryCode.toUpperCase() !== "DO") {
    return NextResponse.json({ error: "unsupported_country" }, { status: 400 });
  }
  if (!(proof instanceof File) || proof.size === 0) {
    return NextResponse.json({ error: "missing_proof" }, { status: 400 });
  }
  if (proof.size > MAX_PROOF_BYTES) {
    return NextResponse.json({ error: "proof_too_large" }, { status: 400 });
  }
  const extension = extensionFromMimeType(proof.type);
  if (!extension) {
    return NextResponse.json({ error: "invalid_proof_type" }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const { data: variants, error: variantsError } = await supabase
    .from("product_variants")
    .select("id, price_cents, stock")
    .in("id", cartItems.map((i) => i.variantId));
  if (variantsError || !variants) {
    return NextResponse.json({ error: "invalid_items" }, { status: 400 });
  }

  const { data: zones, error: zonesError } = await supabase.from("shipping_zones").select("*");
  if (zonesError || !zones) {
    return NextResponse.json({ error: "no_shipping_zone" }, { status: 400 });
  }

  const draftResult = buildOrderDraft(cartItems, variants, zones, customer.countryCode, customer.city);
  if (!draftResult.ok) {
    return NextResponse.json(draftResult.body, { status: draftResult.status });
  }
  const { lines, subtotalCents, shippingCents, totalCents, zone } = draftResult.draft;

  const proofPath = `bank-transfer/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("payment-proofs")
    .upload(proofPath, proof, { contentType: proof.type });
  if (uploadError) {
    return NextResponse.json({ error: "proof_upload_failed" }, { status: 500 });
  }

  const { data: orderRow, error: orderError } = await supabase
    .from("orders")
    .insert({
      customer_name: customer.name,
      customer_email: customer.email,
      address_line: customer.address,
      city: customer.city,
      country_code: customer.countryCode,
      shipping_zone_id: zone.id,
      status: "pending",
      payment_method: "bank_transfer",
      payment_proof_path: proofPath,
      subtotal_cents: subtotalCents,
      shipping_cents: shippingCents,
      total_cents: totalCents,
      locale,
    })
    .select()
    .single();
  if (orderError || !orderRow) {
    return NextResponse.json({ error: "order_create_failed" }, { status: 500 });
  }

  const itemRows = lines.map((line) => ({
    order_id: orderRow.id,
    variant_id: line.variantId,
    quantity: line.quantity,
    unit_price_cents: line.unitPriceCents,
  }));
  const { error: itemsError } = await supabase.from("order_items").insert(itemRows);
  if (itemsError) {
    return NextResponse.json({ error: "order_create_failed" }, { status: 500 });
  }

  try {
    await sendAdminNewOrderEmail(orderRow, {
      note: "Pago por deposito bancario. Revisa el comprobante en el panel de administracion antes de marcarlo como pagado.",
    });
  } catch (err) {
    console.error(`Admin notification email failed for order ${orderRow.id}:`, err);
  }

  return NextResponse.json({ orderId: orderRow.id });
}
