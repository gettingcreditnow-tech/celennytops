export type Product = {
  id: string;
  nameEs: string;
  nameEn: string;
  descriptionEs: string;
  descriptionEn: string;
  category: string;
  images: string[];
  isActive: boolean;
};

export type ProductVariant = {
  id: string;
  productId: string;
  size: string | null;
  color: string | null;
  priceCents: number;
  sku: string;
  stock: number;
};

export type ShippingZone = {
  id: string;
  name: string;
  countryCodes: string[];
  rateCents: number;
};

export type OrderStatus = "pending" | "paid" | "shipped" | "cancelled";

/**
 * A row of the `orders` table exactly as Supabase returns it (snake_case).
 * Orders are only ever read/written as raw rows - by the PayPal routes, the
 * admin screens and the email builders - so unlike `Product`/`ProductVariant`
 * there is no camelCase mapping layer, and this is the single shape everything
 * in the order path shares. Mirrors supabase/migrations/0001_init.sql.
 */
export type OrderRow = {
  id: string;
  customer_name: string;
  customer_email: string;
  address_line: string;
  city: string;
  country_code: string;
  shipping_zone_id: string | null;
  status: OrderStatus;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  locale: "es" | "en";
  tracking_number: string | null;
  paypal_order_id: string | null;
  created_at: string;
};

/** A row of the `order_items` table (snake_case), as Supabase returns it. */
export type OrderItemRow = {
  id: string;
  order_id: string;
  variant_id: string;
  quantity: number;
  unit_price_cents: number;
};
