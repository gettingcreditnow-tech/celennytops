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

export type Order = {
  id: string;
  customerName: string;
  customerEmail: string;
  addressLine: string;
  city: string;
  countryCode: string;
  shippingZoneId: string | null;
  status: OrderStatus;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  locale: "es" | "en";
  trackingNumber: string | null;
  paypalOrderId: string | null;
};

export type OrderItem = {
  id: string;
  orderId: string;
  variantId: string;
  quantity: number;
  unitPriceCents: number;
};
