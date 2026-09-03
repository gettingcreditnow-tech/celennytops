# Celenny Tops — Tienda online (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working, bilingual (ES/EN) e-commerce store for Celenny Tops — catalog with product variants, cart, PayPal checkout with automatic payment confirmation, fixed-rate shipping zones, order email notifications, and an admin panel for managing products, orders, and shipping zones.

**Architecture:** A single Next.js (App Router, TypeScript) project serves both the public storefront (under `[locale]/`) and the admin panel (`/admin`, Supabase-Auth-gated). Supabase (Postgres + Auth + Storage) is the sole backend. PayPal Orders API handles payment; a server route captures payment and atomically writes the order, decrementing stock. Resend sends transactional email.

**Tech Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase (`@supabase/supabase-js`, `@supabase/ssr`) · next-intl · `@paypal/react-paypal-js` + PayPal REST Orders API v2 · Resend · Vitest + Testing Library

## Global Constraints

- All monetary amounts are stored and computed as **integer USD cents** (never floats). Convert to a decimal string only at the PayPal API boundary and for display.
- Default locale is **Spanish (`es`)**; English (`en`) is the secondary locale. Locale is part of the URL path (`/es/...`, `/en/...`).
- Server code that needs elevated privileges (writing orders, decrementing stock, admin writes bypassing RLS timing issues) uses the Supabase **service role** key and must never run in client code.
- Never trust client-submitted prices or totals — the server always recomputes subtotal/shipping/total from the database before creating or capturing a PayPal order.
- Package manager: npm. Node 20+. TypeScript `strict: true`.
- Tests use Vitest (`*.test.ts`) colocated under `src/**/__tests__/` or `tests/unit/`; run via `npm test`.
- Every task ends with a commit.

---

## File Structure

```
celenny-tops/
  package.json, tsconfig.json, next.config.ts, tailwind.config.ts, vitest.config.ts
  .env.local.example
  middleware.ts                          # next-intl locale routing
  i18n/routing.ts, i18n/request.ts
  messages/es.json, messages/en.json
  supabase/migrations/0001_init.sql
  supabase/seed.sql
  src/
    lib/
      supabase/client.ts                 # browser client
      supabase/server.ts                 # server (RSC/route) client, user session
      supabase/admin.ts                  # service-role client (server-only)
      types.ts                           # shared domain types
      pricing.ts                         # computeSubtotalCents, computeTotalCents, formatUsd
      shipping.ts                        # getShippingZoneForCountry
      cart.ts                            # cartReducer, CartState/CartItem/CartAction
      paypal.ts                          # getPayPalAccessToken, createPayPalOrder, capturePayPalOrder
      email.ts                           # sendOrderConfirmationEmail, sendAdminNewOrderEmail
      products.ts                        # listActiveProducts, getProductById (Supabase queries)
    context/CartContext.tsx
    components/
      storefront/ProductCard.tsx, ProductGrid.tsx, VariantSelector.tsx,
        CartDrawer.tsx, LanguageSwitcher.tsx, SiteHeader.tsx, SiteFooter.tsx
      admin/AdminNav.tsx, ProductForm.tsx, OrdersTable.tsx, ShippingZonesForm.tsx
    app/
      [locale]/layout.tsx, [locale]/page.tsx
      [locale]/catalog/page.tsx
      [locale]/product/[id]/page.tsx
      [locale]/checkout/page.tsx
      [locale]/checkout/confirmation/[orderId]/page.tsx
      admin/layout.tsx, admin/login/page.tsx
      admin/products/page.tsx, admin/products/new/page.tsx, admin/products/[id]/page.tsx
      admin/orders/page.tsx, admin/orders/[id]/page.tsx
      admin/shipping-zones/page.tsx
      api/paypal/create-order/route.ts
      api/paypal/capture-order/route.ts
  tests/unit/pricing.test.ts, shipping.test.ts, cart.test.ts, paypal.test.ts
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `vitest.config.ts`, `.gitignore`, `.env.local.example`, `src/app/layout.tsx` (temporary root), `src/app/globals.css`

**Interfaces:**
- Produces: a runnable Next.js dev server (`npm run dev`) and a working test runner (`npm test`), consumed by every later task.

- [ ] **Step 1: Scaffold Next.js app**

```bash
cd C:\Users\hvpro\celenny-tops
npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack --use-npm
```
When prompted about the non-empty directory (it already contains `docs/`), confirm to proceed.

- [ ] **Step 2: Add project dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr next-intl @paypal/react-paypal-js resend zod
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

Create `vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 4: Write a smoke test to verify the toolchain**

Create `tests/unit/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: 1 passed (smoke test).

- [ ] **Step 6: Create `.env.local.example`**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
RESEND_API_KEY=
ORDER_NOTIFICATION_EMAIL=
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with Tailwind and Vitest"
```

---

### Task 2: Database schema and Supabase clients

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `supabase/seed.sql`, `src/lib/types.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`

**Interfaces:**
- Produces: `Product`, `ProductVariant`, `ShippingZone`, `Order`, `OrderItem` types (src/lib/types.ts); `createBrowserSupabaseClient()`, `createServerSupabaseClient()`, `createAdminSupabaseClient()`.
- Consumed by: every task touching data (5, 6, 8, 9, 10, 11, 12, 13, 15, 16).

- [ ] **Step 1: Write the SQL migration**

Create `supabase/migrations/0001_init.sql`:

```sql
create extension if not exists "pgcrypto";

create table products (
  id uuid primary key default gen_random_uuid(),
  name_es text not null,
  name_en text not null,
  description_es text not null default '',
  description_en text not null default '',
  category text not null default 'tops',
  images text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  size text,
  color text,
  price_cents integer not null check (price_cents >= 0),
  sku text not null unique,
  stock integer not null default 0 check (stock >= 0),
  created_at timestamptz not null default now()
);

create table shipping_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_codes text[] not null default '{}',
  rate_cents integer not null check (rate_cents >= 0),
  sort_order integer not null default 0
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_email text not null,
  address_line text not null,
  city text not null,
  country_code text not null,
  shipping_zone_id uuid references shipping_zones(id),
  status text not null default 'pending' check (status in ('pending','paid','shipped','cancelled')),
  subtotal_cents integer not null,
  shipping_cents integer not null,
  total_cents integer not null,
  locale text not null default 'es',
  tracking_number text,
  paypal_order_id text unique,
  created_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  variant_id uuid not null references product_variants(id),
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null
);

alter table products enable row level security;
alter table product_variants enable row level security;
alter table shipping_zones enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

create policy "public read active products" on products
  for select using (is_active = true);
create policy "authenticated full access products" on products
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "public read variants of active products" on product_variants
  for select using (
    exists (select 1 from products p where p.id = product_id and p.is_active = true)
  );
create policy "authenticated full access variants" on product_variants
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "public read shipping zones" on shipping_zones
  for select using (true);
create policy "authenticated full access shipping zones" on shipping_zones
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated read orders" on orders
  for select using (auth.role() = 'authenticated');
create policy "authenticated update orders" on orders
  for update using (auth.role() = 'authenticated');

create policy "authenticated read order items" on order_items
  for select using (auth.role() = 'authenticated');
```

Note: `orders`/`order_items` INSERT is done only via the service-role client from the PayPal capture route (Task 12), which bypasses RLS — no public insert policy is needed or created.

- [ ] **Step 2: Write the seed data**

Create `supabase/seed.sql`:

```sql
insert into shipping_zones (name, country_codes, rate_cents, sort_order) values
  ('Pais local', array['CO'], 500, 1),
  ('Latinoamerica', array['MX','AR','PE','CL','EC','BR','VE','UY','PY','BO'], 1200, 2),
  ('Resto del mundo', array['*'], 2500, 3);
```

(Adjust the local country code once confirmed with the user; `*` is the catch-all handled by `getShippingZoneForCountry`, Task 5.)

- [ ] **Step 3: Define shared domain types**

Create `src/lib/types.ts`:

```ts
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
```

- [ ] **Step 4: Create the Supabase clients**

Create `src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

Create `src/lib/supabase/server.ts`:

```ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}
```

Create `src/lib/supabase/admin.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

export function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

- [ ] **Step 5: Verify the project still builds**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add supabase src/lib/types.ts src/lib/supabase
git commit -m "feat: add Supabase schema, seed data, and typed clients"
```

Document in the PR/commit description that `supabase/migrations/0001_init.sql` and `supabase/seed.sql` must be run against the Supabase project (SQL editor or `supabase db push`) before the app can read data — this is a manual one-time setup step, not part of the app's runtime.

---

### Task 3: i18n routing and messages

**Files:**
- Create: `i18n/routing.ts`, `i18n/request.ts`, `middleware.ts`, `messages/es.json`, `messages/en.json`
- Modify: `next.config.ts`

**Interfaces:**
- Produces: `routing` (locales `["es","en"]`, default `"es"`), `Link`/`useRouter`/`redirect` from `i18n/routing.ts` used by every page and component under `src/app/[locale]`.

- [ ] **Step 1: Define routing config**

Create `i18n/routing.ts`:

```ts
import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

export const routing = defineRouting({
  locales: ["es", "en"],
  defaultLocale: "es",
});

export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
```

Create `i18n/request.ts`:

```ts
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as "es" | "en")) {
    locale = routing.defaultLocale;
  }
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 2: Add the middleware**

Create `middleware.ts`:

```ts
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
```

- [ ] **Step 3: Wire the plugin into `next.config.ts`**

```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
```

- [ ] **Step 4: Seed base translation messages**

Create `messages/es.json`:

```json
{
  "nav": { "catalog": "Catalogo", "cart": "Carrito" },
  "home": { "tagline": "Tejido a mano con amor", "cta": "Ver catalogo" },
  "product": { "addToCart": "Agregar al carrito", "outOfStock": "Agotado", "size": "Talla", "color": "Color" },
  "cart": { "title": "Tu carrito", "empty": "Tu carrito esta vacio", "subtotal": "Subtotal", "checkout": "Finalizar compra" },
  "checkout": { "title": "Finalizar compra", "name": "Nombre completo", "email": "Correo electronico", "address": "Direccion", "city": "Ciudad", "country": "Pais", "shipping": "Envio", "total": "Total", "pay": "Pagar con PayPal" },
  "confirmation": { "title": "Gracias por tu compra", "body": "Te enviamos un correo con los detalles de tu pedido." }
}
```

Create `messages/en.json`:

```json
{
  "nav": { "catalog": "Catalog", "cart": "Cart" },
  "home": { "tagline": "Handmade with love", "cta": "View catalog" },
  "product": { "addToCart": "Add to cart", "outOfStock": "Out of stock", "size": "Size", "color": "Color" },
  "cart": { "title": "Your cart", "empty": "Your cart is empty", "subtotal": "Subtotal", "checkout": "Checkout" },
  "checkout": { "title": "Checkout", "name": "Full name", "email": "Email", "address": "Address", "city": "City", "country": "Country", "shipping": "Shipping", "total": "Total", "pay": "Pay with PayPal" },
  "confirmation": { "title": "Thank you for your order", "body": "We sent you an email with your order details." }
}
```

- [ ] **Step 5: Move the root layout under `[locale]` and provide messages**

Delete the placeholder `src/app/layout.tsx` and `src/app/page.tsx` created by `create-next-app`. Create `src/app/[locale]/layout.tsx`:

```tsx
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { routing } from "../../../i18n/routing";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

Create a placeholder `src/app/[locale]/page.tsx` (replaced fully in Task 8):

```tsx
import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations("home");
  return <main><h1>{t("tagline")}</h1></main>;
}
```

- [ ] **Step 6: Verify both locales render**

Run: `npm run dev` (in background) then check:
```bash
curl -s http://localhost:3000/es | grep -o "Tejido a mano con amor"
curl -s http://localhost:3000/en | grep -o "Handmade with love"
```
Expected: each command prints the matching tagline. Stop the dev server after.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add next-intl routing with ES/EN messages"
```

---

### Task 4: Design tokens and shared shell (header/footer)

**Files:**
- Modify: `tailwind.config.ts`, `src/app/globals.css`
- Create: `src/components/storefront/SiteHeader.tsx`, `src/components/storefront/SiteFooter.tsx`, `src/components/storefront/LanguageSwitcher.tsx`
- Modify: `src/app/[locale]/layout.tsx`

**Interfaces:**
- Produces: Tailwind theme colors `brand-pink`, `brand-crimson`, `brand-crimson-dark`; `<SiteHeader />`/`<SiteFooter />` wrapping every storefront page.
- Consumes: `Link`, `usePathname` from `i18n/routing.ts` (Task 3).

- [ ] **Step 1: Add brand colors and fonts to the Tailwind theme**

Edit `tailwind.config.ts` `theme.extend`:

```ts
extend: {
  colors: {
    "brand-pink": "#FBE1E9",
    "brand-crimson": "#C41E3A",
    "brand-crimson-dark": "#8E1428",
  },
  fontFamily: {
    script: ["\"Pacifico\"", "cursive"],
    body: ["\"Nunito\"", "sans-serif"],
  },
},
```

- [ ] **Step 2: Load the fonts and set base background**

Add to `src/app/globals.css` (top, above Tailwind directives... actually after, using `@import`):

```css
@import url('https://fonts.googleapis.com/css2?family=Pacifico&family=Nunito:wght@400;600;700&display=swap');

body {
  @apply bg-brand-pink font-body text-brand-crimson-dark;
}
```

- [ ] **Step 3: Build the language switcher**

Create `src/components/storefront/LanguageSwitcher.tsx`:

```tsx
"use client";

import { usePathname, useRouter } from "../../../i18n/routing";
import { useLocale } from "next-intl";

export function LanguageSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const other = locale === "es" ? "en" : "es";

  return (
    <button
      onClick={() => router.replace(pathname, { locale: other })}
      className="text-sm font-semibold uppercase"
    >
      {other}
    </button>
  );
}
```

- [ ] **Step 4: Build the header and footer**

Create `src/components/storefront/SiteHeader.tsx`:

```tsx
import { useTranslations } from "next-intl";
import { Link } from "../../../i18n/routing";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function SiteHeader() {
  const t = useTranslations("nav");
  return (
    <header className="flex items-center justify-between px-6 py-4 font-script text-2xl">
      <Link href="/">Celenny tops</Link>
      <nav className="flex items-center gap-4 text-base font-body">
        <Link href="/catalog">{t("catalog")}</Link>
        <Link href="/cart">{t("cart")}</Link>
        <LanguageSwitcher />
      </nav>
    </header>
  );
}
```

Create `src/components/storefront/SiteFooter.tsx`:

```tsx
export function SiteFooter() {
  return (
    <footer className="px-6 py-8 text-center text-sm">
      Handmade with love — Celenny tops
    </footer>
  );
}
```

- [ ] **Step 5: Wire header/footer into the locale layout**

Edit `src/app/[locale]/layout.tsx` body:

```tsx
<NextIntlClientProvider messages={messages}>
  <SiteHeader />
  {children}
  <SiteFooter />
</NextIntlClientProvider>
```
(add the two imports)

- [ ] **Step 6: Visually verify**

Run `npm run dev` in background, open `http://localhost:3000/es` in a browser, confirm the pink background, header with "Celenny tops" in script font, and language switch button toggles `/es` \<-\> `/en`. Stop the dev server after.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add brand theme and site header/footer shell"
```

---

### Task 5: Pricing and shipping-zone logic (TDD)

**Files:**
- Create: `src/lib/pricing.ts`, `src/lib/shipping.ts`
- Test: `tests/unit/pricing.test.ts`, `tests/unit/shipping.test.ts`

**Interfaces:**
- Produces: `computeSubtotalCents(lines): number`, `computeTotalCents(subtotalCents, shippingCents): number`, `formatUsd(cents): string`, `getShippingZoneForCountry(countryCode, zones): ShippingZone | null`.
- Consumed by: Task 10 (checkout), Task 11 (create-order route), Task 12 (capture-order route).

- [ ] **Step 1: Write the failing pricing tests**

Create `tests/unit/pricing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeSubtotalCents, computeTotalCents, formatUsd } from "@/lib/pricing";

describe("computeSubtotalCents", () => {
  it("sums unit price times quantity across lines", () => {
    const total = computeSubtotalCents([
      { unitPriceCents: 2500, quantity: 2 },
      { unitPriceCents: 1000, quantity: 1 },
    ]);
    expect(total).toBe(6000);
  });

  it("returns 0 for an empty cart", () => {
    expect(computeSubtotalCents([])).toBe(0);
  });
});

describe("computeTotalCents", () => {
  it("adds shipping to subtotal", () => {
    expect(computeTotalCents(6000, 1200)).toBe(7200);
  });
});

describe("formatUsd", () => {
  it("formats cents as a two-decimal dollar string", () => {
    expect(formatUsd(7200)).toBe("72.00");
    expect(formatUsd(50)).toBe("0.50");
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/pricing'`.

- [ ] **Step 3: Implement `src/lib/pricing.ts`**

```ts
export type OrderLineInput = { unitPriceCents: number; quantity: number };

export function computeSubtotalCents(lines: OrderLineInput[]): number {
  return lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
}

export function computeTotalCents(subtotalCents: number, shippingCents: number): number {
  return subtotalCents + shippingCents;
}

export function formatUsd(cents: number): string {
  return (cents / 100).toFixed(2);
}
```

- [ ] **Step 4: Run and verify pricing tests pass**

Run: `npm test`
Expected: pricing tests PASS.

- [ ] **Step 5: Write the failing shipping-zone tests**

Create `tests/unit/shipping.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getShippingZoneForCountry } from "@/lib/shipping";
import type { ShippingZone } from "@/lib/types";

const zones: ShippingZone[] = [
  { id: "1", name: "Pais local", countryCodes: ["CO"], rateCents: 500 },
  { id: "2", name: "Latinoamerica", countryCodes: ["MX", "AR"], rateCents: 1200 },
  { id: "3", name: "Resto del mundo", countryCodes: ["*"], rateCents: 2500 },
];

describe("getShippingZoneForCountry", () => {
  it("matches an explicit country code", () => {
    expect(getShippingZoneForCountry("CO", zones)?.id).toBe("1");
  });

  it("is case-insensitive", () => {
    expect(getShippingZoneForCountry("mx", zones)?.id).toBe("2");
  });

  it("falls back to the catch-all zone for unlisted countries", () => {
    expect(getShippingZoneForCountry("DE", zones)?.id).toBe("3");
  });

  it("returns null when there is no catch-all and no match", () => {
    const noCatchAll = zones.slice(0, 2);
    expect(getShippingZoneForCountry("DE", noCatchAll)).toBeNull();
  });
});
```

- [ ] **Step 6: Run and verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/shipping'`.

- [ ] **Step 7: Implement `src/lib/shipping.ts`**

```ts
import type { ShippingZone } from "./types";

export function getShippingZoneForCountry(
  countryCode: string,
  zones: ShippingZone[]
): ShippingZone | null {
  const upper = countryCode.toUpperCase();
  const exact = zones.find((z) => z.countryCodes.includes(upper));
  if (exact) return exact;
  return zones.find((z) => z.countryCodes.includes("*")) ?? null;
}
```

- [ ] **Step 8: Run full suite and verify all pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/pricing.ts src/lib/shipping.ts tests/unit/pricing.test.ts tests/unit/shipping.test.ts
git commit -m "feat: add pricing and shipping-zone lookup logic"
```

---

### Task 6: Cart reducer logic (TDD)

**Files:**
- Create: `src/lib/cart.ts`
- Test: `tests/unit/cart.test.ts`

**Interfaces:**
- Produces: `CartItem`, `CartState`, `CartAction`, `cartReducer(state, action): CartState`.
- Consumed by: Task 7 (`CartContext`).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/cart.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cartReducer, type CartState, type CartItem } from "@/lib/cart";

const empty: CartState = { items: [] };

const item: CartItem = {
  variantId: "v1",
  productId: "p1",
  name: "Top rojo",
  size: "M",
  color: "Rojo",
  unitPriceCents: 2500,
  quantity: 1,
  maxStock: 3,
};

describe("cartReducer", () => {
  it("adds a new item", () => {
    const state = cartReducer(empty, { type: "ADD_ITEM", item });
    expect(state.items).toHaveLength(1);
    expect(state.items[0].quantity).toBe(1);
  });

  it("increments quantity when adding an existing variant", () => {
    const withItem = cartReducer(empty, { type: "ADD_ITEM", item });
    const state = cartReducer(withItem, {
      type: "ADD_ITEM",
      item: { ...item, quantity: 1 },
    });
    expect(state.items[0].quantity).toBe(2);
  });

  it("caps quantity at maxStock", () => {
    const withItem = cartReducer(empty, { type: "ADD_ITEM", item });
    const state = cartReducer(withItem, {
      type: "ADD_ITEM",
      item: { ...item, quantity: 5 },
    });
    expect(state.items[0].quantity).toBe(3);
  });

  it("removes an item", () => {
    const withItem = cartReducer(empty, { type: "ADD_ITEM", item });
    const state = cartReducer(withItem, { type: "REMOVE_ITEM", variantId: "v1" });
    expect(state.items).toHaveLength(0);
  });

  it("sets quantity directly, capped at maxStock", () => {
    const withItem = cartReducer(empty, { type: "ADD_ITEM", item });
    const state = cartReducer(withItem, {
      type: "SET_QUANTITY",
      variantId: "v1",
      quantity: 10,
    });
    expect(state.items[0].quantity).toBe(3);
  });

  it("removes the item when quantity is set to 0", () => {
    const withItem = cartReducer(empty, { type: "ADD_ITEM", item });
    const state = cartReducer(withItem, {
      type: "SET_QUANTITY",
      variantId: "v1",
      quantity: 0,
    });
    expect(state.items).toHaveLength(0);
  });

  it("clears the cart", () => {
    const withItem = cartReducer(empty, { type: "ADD_ITEM", item });
    expect(cartReducer(withItem, { type: "CLEAR" }).items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/cart'`.

- [ ] **Step 3: Implement `src/lib/cart.ts`**

```ts
export type CartItem = {
  variantId: string;
  productId: string;
  name: string;
  size: string | null;
  color: string | null;
  unitPriceCents: number;
  quantity: number;
  maxStock: number;
};

export type CartState = { items: CartItem[] };

export type CartAction =
  | { type: "ADD_ITEM"; item: CartItem }
  | { type: "REMOVE_ITEM"; variantId: string }
  | { type: "SET_QUANTITY"; variantId: string; quantity: number }
  | { type: "CLEAR" };

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD_ITEM": {
      const existing = state.items.find((i) => i.variantId === action.item.variantId);
      if (existing) {
        const quantity = Math.min(
          existing.quantity + action.item.quantity,
          existing.maxStock
        );
        return {
          items: state.items.map((i) =>
            i.variantId === action.item.variantId ? { ...i, quantity } : i
          ),
        };
      }
      return {
        items: [
          ...state.items,
          { ...action.item, quantity: Math.min(action.item.quantity, action.item.maxStock) },
        ],
      };
    }
    case "REMOVE_ITEM":
      return { items: state.items.filter((i) => i.variantId !== action.variantId) };
    case "SET_QUANTITY": {
      if (action.quantity <= 0) {
        return { items: state.items.filter((i) => i.variantId !== action.variantId) };
      }
      return {
        items: state.items.map((i) =>
          i.variantId === action.variantId
            ? { ...i, quantity: Math.min(action.quantity, i.maxStock) }
            : i
        ),
      };
    }
    case "CLEAR":
      return { items: [] };
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run and verify all pass**

Run: `npm test`
Expected: all cart tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cart.ts tests/unit/cart.test.ts
git commit -m "feat: add cart reducer logic"
```

---

### Task 7: Cart context and CartDrawer UI

**Files:**
- Create: `src/context/CartContext.tsx`, `src/components/storefront/CartDrawer.tsx`
- Test: `tests/unit/CartDrawer.test.tsx`
- Modify: `src/app/[locale]/layout.tsx`, `src/components/storefront/SiteHeader.tsx`

**Interfaces:**
- Consumes: `cartReducer`, `CartState`, `CartItem` (Task 6).
- Produces: `CartProvider`, `useCart()` returning `{ state, addItem, removeItem, setQuantity, clear }`, `<CartDrawer />`.
- Consumed by: Task 9 (product page "add to cart"), Task 10 (checkout reads cart).

- [ ] **Step 1: Implement the cart context**

Create `src/context/CartContext.tsx`:

```tsx
"use client";

import { createContext, useContext, useEffect, useReducer } from "react";
import { cartReducer, type CartItem, type CartState } from "@/lib/cart";

const STORAGE_KEY = "celenny-cart";

type CartContextValue = {
  state: CartState;
  addItem: (item: CartItem) => void;
  removeItem: (variantId: string) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function loadInitialState(): CartState {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartState) : { items: [] };
  } catch {
    return { items: [] };
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] }, loadInitialState);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const value: CartContextValue = {
    state,
    addItem: (item) => dispatch({ type: "ADD_ITEM", item }),
    removeItem: (variantId) => dispatch({ type: "REMOVE_ITEM", variantId }),
    setQuantity: (variantId, quantity) =>
      dispatch({ type: "SET_QUANTITY", variantId, quantity }),
    clear: () => dispatch({ type: "CLEAR" }),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
```

- [ ] **Step 2: Write a failing test for the CartDrawer**

Create `tests/unit/CartDrawer.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/es.json";
import { CartProvider, useCart } from "@/context/CartContext";
import { CartDrawer } from "@/components/storefront/CartDrawer";

function Harness() {
  const { addItem } = useCart();
  return (
    <>
      <button
        onClick={() =>
          addItem({
            variantId: "v1",
            productId: "p1",
            name: "Top rojo",
            size: "M",
            color: "Rojo",
            unitPriceCents: 2500,
            quantity: 1,
            maxStock: 3,
          })
        }
      >
        add
      </button>
      <CartDrawer />
    </>
  );
}

describe("CartDrawer", () => {
  it("shows the empty state, then the item and subtotal after adding", () => {
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <CartProvider>
          <Harness />
        </CartProvider>
      </NextIntlClientProvider>
    );

    expect(screen.getByText(/vacio/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText("add"));

    expect(screen.getByText("Top rojo")).toBeInTheDocument();
    expect(screen.getByText("25.00")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run and verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/components/storefront/CartDrawer'`.

- [ ] **Step 4: Implement the CartDrawer**

Create `src/components/storefront/CartDrawer.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useCart } from "@/context/CartContext";
import { computeSubtotalCents, formatUsd } from "@/lib/pricing";

export function CartDrawer() {
  const t = useTranslations("cart");
  const { state, removeItem, setQuantity } = useCart();

  if (state.items.length === 0) {
    return <p>{t("empty")}</p>;
  }

  const subtotal = computeSubtotalCents(state.items);

  return (
    <div>
      <h2>{t("title")}</h2>
      <ul>
        {state.items.map((item) => (
          <li key={item.variantId}>
            <span>{item.name}</span>
            <input
              type="number"
              min={0}
              max={item.maxStock}
              value={item.quantity}
              onChange={(e) => setQuantity(item.variantId, Number(e.target.value))}
              aria-label={`quantity-${item.variantId}`}
            />
            <span>{formatUsd(item.unitPriceCents * item.quantity)}</span>
            <button onClick={() => removeItem(item.variantId)}>x</button>
          </li>
        ))}
      </ul>
      <p>
        {t("subtotal")}: {formatUsd(subtotal)}
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Run and verify the test passes**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Wire `CartProvider` into the locale layout**

Edit `src/app/[locale]/layout.tsx`, wrap `<SiteHeader />{children}<SiteFooter />` with `<CartProvider>...</CartProvider>` (import from `@/context/CartContext`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add cart context and CartDrawer component"
```

---

### Task 8: Product data layer, Home page, Catalog page

**Files:**
- Create: `src/lib/products.ts`, `src/components/storefront/ProductCard.tsx`, `src/components/storefront/ProductGrid.tsx`
- Modify: `src/app/[locale]/page.tsx`
- Create: `src/app/[locale]/catalog/page.tsx`
- Test: `tests/unit/ProductCard.test.tsx`

**Interfaces:**
- Consumes: `createServerSupabaseClient` (Task 2), `Product`/`ProductVariant` types (Task 2).
- Produces: `listActiveProducts(): Promise<(Product & { variants: ProductVariant[] })[]>`, `getProductById(id): Promise<(Product & { variants: ProductVariant[] }) | null>`.
- Consumed by: Task 9 (product detail page).

- [ ] **Step 1: Implement the product data layer**

Create `src/lib/products.ts`:

```ts
import { createServerSupabaseClient } from "./supabase/server";
import type { Product, ProductVariant } from "./types";

export type ProductWithVariants = Product & { variants: ProductVariant[] };

function mapProduct(row: any): Product {
  return {
    id: row.id,
    nameEs: row.name_es,
    nameEn: row.name_en,
    descriptionEs: row.description_es,
    descriptionEn: row.description_en,
    category: row.category,
    images: row.images ?? [],
    isActive: row.is_active,
  };
}

function mapVariant(row: any): ProductVariant {
  return {
    id: row.id,
    productId: row.product_id,
    size: row.size,
    color: row.color,
    priceCents: row.price_cents,
    sku: row.sku,
    stock: row.stock,
  };
}

export async function listActiveProducts(): Promise<ProductWithVariants[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("*, product_variants(*)")
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...mapProduct(row),
    variants: (row.product_variants ?? []).map(mapVariant),
  }));
}

export async function getProductById(id: string): Promise<ProductWithVariants | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("*, product_variants(*)")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...mapProduct(data), variants: (data.product_variants ?? []).map(mapVariant) };
}
```

- [ ] **Step 2: Write a failing test for ProductCard**

Create `tests/unit/ProductCard.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/es.json";
import { ProductCard } from "@/components/storefront/ProductCard";
import type { ProductWithVariants } from "@/lib/products";

const product: ProductWithVariants = {
  id: "p1",
  nameEs: "Top rojo",
  nameEn: "Red top",
  descriptionEs: "",
  descriptionEn: "",
  category: "tops",
  images: ["/placeholder.jpg"],
  isActive: true,
  variants: [
    { id: "v1", productId: "p1", size: "M", color: "Rojo", priceCents: 2500, sku: "T-R-M", stock: 2 },
    { id: "v2", productId: "p1", size: "L", color: "Rojo", priceCents: 2500, sku: "T-R-L", stock: 0 },
  ],
};

describe("ProductCard", () => {
  it("shows the lowest variant price and does not mark in-stock products as sold out", () => {
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <ProductCard product={product} locale="es" />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("Top rojo")).toBeInTheDocument();
    expect(screen.getByText("25.00")).toBeInTheDocument();
    expect(screen.queryByText(/agotado/i)).not.toBeInTheDocument();
  });

  it("marks a product sold out when every variant has 0 stock", () => {
    const soldOut = { ...product, variants: product.variants.map((v) => ({ ...v, stock: 0 })) };
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <ProductCard product={soldOut} locale="es" />
      </NextIntlClientProvider>
    );
    expect(screen.getByText(/agotado/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run and verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/components/storefront/ProductCard'`.

- [ ] **Step 4: Implement ProductCard and ProductGrid**

Create `src/components/storefront/ProductCard.tsx`:

```tsx
import { useTranslations } from "next-intl";
import { Link } from "../../../i18n/routing";
import { formatUsd } from "@/lib/pricing";
import type { ProductWithVariants } from "@/lib/products";

export function ProductCard({
  product,
  locale,
}: {
  product: ProductWithVariants;
  locale: "es" | "en";
}) {
  const t = useTranslations("product");
  const name = locale === "es" ? product.nameEs : product.nameEn;
  const inStockVariants = product.variants.filter((v) => v.stock > 0);
  const soldOut = inStockVariants.length === 0;
  const lowestPrice = Math.min(...product.variants.map((v) => v.priceCents));

  return (
    <Link href={`/product/${product.id}`} className="block">
      <img src={product.images[0] ?? "/placeholder.jpg"} alt={name} />
      <h3>{name}</h3>
      <p>{formatUsd(lowestPrice)}</p>
      {soldOut && <span>{t("outOfStock")}</span>}
    </Link>
  );
}
```

Create `src/components/storefront/ProductGrid.tsx`:

```tsx
import { ProductCard } from "./ProductCard";
import type { ProductWithVariants } from "@/lib/products";

export function ProductGrid({
  products,
  locale,
}: {
  products: ProductWithVariants[];
  locale: "es" | "en";
}) {
  return (
    <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} locale={locale} />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run and verify tests pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Build the Home and Catalog pages**

Replace `src/app/[locale]/page.tsx`:

```tsx
import { useTranslations } from "next-intl";
import { Link } from "../../../i18n/routing";

export default function HomePage() {
  const t = useTranslations("home");
  return (
    <main className="px-6 py-16 text-center">
      <h1 className="font-script text-4xl">{t("tagline")}</h1>
      <Link href="/catalog" className="mt-6 inline-block rounded-full bg-brand-crimson px-6 py-3 text-white">
        {t("cta")}
      </Link>
    </main>
  );
}
```

Create `src/app/[locale]/catalog/page.tsx`:

```tsx
import { listActiveProducts } from "@/lib/products";
import { ProductGrid } from "@/components/storefront/ProductGrid";

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ locale: "es" | "en" }>;
}) {
  const { locale } = await params;
  const products = await listActiveProducts();
  return (
    <main className="px-6 py-10">
      <ProductGrid products={products} locale={locale} />
    </main>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add product data layer, home page, and catalog page"
```

---

### Task 9: Product detail page and variant selector

**Files:**
- Create: `src/components/storefront/VariantSelector.tsx`
- Create: `src/app/[locale]/product/[id]/page.tsx`
- Test: `tests/unit/VariantSelector.test.tsx`

**Interfaces:**
- Consumes: `getProductById` (Task 8), `useCart` (Task 7).
- Produces: `<VariantSelector product locale onAddToCart />`.

- [ ] **Step 1: Write a failing test for VariantSelector**

Create `tests/unit/VariantSelector.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/es.json";
import { VariantSelector } from "@/components/storefront/VariantSelector";
import type { ProductWithVariants } from "@/lib/products";

const product: ProductWithVariants = {
  id: "p1",
  nameEs: "Top rojo",
  nameEn: "Red top",
  descriptionEs: "",
  descriptionEn: "",
  category: "tops",
  images: [],
  isActive: true,
  variants: [
    { id: "v1", productId: "p1", size: "M", color: "Rojo", priceCents: 2500, sku: "T-R-M", stock: 2 },
    { id: "v2", productId: "p1", size: "L", color: "Rojo", priceCents: 2500, sku: "T-R-L", stock: 0 },
  ],
};

describe("VariantSelector", () => {
  it("disables out-of-stock variants and calls onAddToCart with the selected variant", () => {
    const onAddToCart = vi.fn();
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <VariantSelector product={product} locale="es" onAddToCart={onAddToCart} />
      </NextIntlClientProvider>
    );

    expect(screen.getByRole("button", { name: "L" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "M" }));
    fireEvent.click(screen.getByText(/agregar al carrito/i));

    expect(onAddToCart).toHaveBeenCalledWith(product.variants[0]);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/components/storefront/VariantSelector'`.

- [ ] **Step 3: Implement VariantSelector**

Create `src/components/storefront/VariantSelector.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ProductVariant } from "@/lib/types";
import type { ProductWithVariants } from "@/lib/products";

export function VariantSelector({
  product,
  locale,
  onAddToCart,
}: {
  product: ProductWithVariants;
  locale: "es" | "en";
  onAddToCart: (variant: ProductVariant) => void;
}) {
  const t = useTranslations("product");
  const [selected, setSelected] = useState<ProductVariant | null>(null);

  return (
    <div>
      <div className="flex gap-2">
        {product.variants.map((v) => (
          <button
            key={v.id}
            disabled={v.stock === 0}
            onClick={() => setSelected(v)}
            aria-pressed={selected?.id === v.id}
            className="border px-3 py-1 disabled:opacity-40"
          >
            {v.size ?? v.color}
          </button>
        ))}
      </div>
      <button
        disabled={!selected}
        onClick={() => selected && onAddToCart(selected)}
        className="mt-4 rounded-full bg-brand-crimson px-6 py-2 text-white disabled:opacity-40"
      >
        {t("addToCart")}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Build the product detail page**

Create `src/app/[locale]/product/[id]/page.tsx`:

```tsx
"use client";

import { use } from "react";
import { useEffect, useState } from "react";
import type { ProductWithVariants } from "@/lib/products";
import { VariantSelector } from "@/components/storefront/VariantSelector";
import { useCart } from "@/context/CartContext";

export default function ProductPage({
  params,
}: {
  params: Promise<{ id: string; locale: "es" | "en" }>;
}) {
  const { id, locale } = use(params);
  const [product, setProduct] = useState<ProductWithVariants | null>(null);
  const { addItem } = useCart();

  useEffect(() => {
    fetch(`/api/products/${id}`)
      .then((r) => r.json())
      .then(setProduct);
  }, [id]);

  if (!product) return null;
  const name = locale === "es" ? product.nameEs : product.nameEn;
  const description = locale === "es" ? product.descriptionEs : product.descriptionEn;

  return (
    <main className="px-6 py-10">
      <img src={product.images[0] ?? "/placeholder.jpg"} alt={name} />
      <h1 className="font-script text-3xl">{name}</h1>
      <p>{description}</p>
      <VariantSelector
        product={product}
        locale={locale}
        onAddToCart={(variant) =>
          addItem({
            variantId: variant.id,
            productId: product.id,
            name,
            size: variant.size,
            color: variant.color,
            unitPriceCents: variant.priceCents,
            quantity: 1,
            maxStock: variant.stock,
          })
        }
      />
    </main>
  );
}
```

Create the backing API route `src/app/api/products/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getProductById } from "@/lib/products";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(product);
}
```

(The product page fetches client-side via this route so `useCart` — a client hook — can live in the same component as the data fetch, keeping this task self-contained without a server/client split.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add product detail page with variant selector"
```

---

### Task 10: Checkout page (shipping form + live totals)

**Files:**
- Create: `src/app/[locale]/checkout/page.tsx`
- Create: `src/app/api/shipping-zones/route.ts`

**Interfaces:**
- Consumes: `useCart` (Task 7), `computeSubtotalCents`/`computeTotalCents`/`formatUsd` (Task 5), `getShippingZoneForCountry` (Task 5).
- Produces: checkout form state `{ name, email, address, city, countryCode }` and computed totals, passed to Task 11's create-order call.

- [ ] **Step 1: Expose shipping zones to the client**

Create `src/app/api/shipping-zones/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("shipping_zones").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    (data ?? []).map((z) => ({
      id: z.id,
      name: z.name,
      countryCodes: z.country_codes,
      rateCents: z.rate_cents,
    }))
  );
}
```

- [ ] **Step 2: Build the checkout page**

Create `src/app/[locale]/checkout/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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
      <div id="paypal-button-container" className="mt-6" />
    </main>
  );
}
```

(`#paypal-button-container` is wired up in Task 11.)

- [ ] **Step 3: Manual verification**

Run `npm run dev` in background. Add an item to the cart from the catalog, go to `/es/checkout`, enter a country code (`CO`, `MX`, `DE`) and confirm the shipping/total figures change to match the seeded zone rates from `supabase/seed.sql`. Stop the dev server after.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add checkout page with live shipping and total calculation"
```

---

### Task 11: PayPal order creation (API route + client Smart Buttons)

**Files:**
- Create: `src/lib/paypal.ts`, `src/app/api/paypal/create-order/route.ts`
- Test: `tests/unit/paypal.test.ts`
- Modify: `src/app/[locale]/checkout/page.tsx`

**Interfaces:**
- Consumes: `computeSubtotalCents`, `computeTotalCents` (Task 5), `getShippingZoneForCountry` (Task 5), `createAdminSupabaseClient` (Task 2).
- Produces: `getPayPalAccessToken()`, `createPayPalOrder(totalCents, currency)` returning `{ id: string }`; `POST /api/paypal/create-order` returning `{ paypalOrderId: string }`.
- Consumed by: Task 12 (capture route reuses `getPayPalAccessToken`).

- [ ] **Step 1: Write the failing unit test for the PayPal helper**

Create `tests/unit/paypal.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPayPalOrder } from "@/lib/paypal";

const originalFetch = global.fetch;

beforeEach(() => {
  process.env.PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";
  process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID = "client-id";
  process.env.PAYPAL_CLIENT_SECRET = "secret";
});

describe("createPayPalOrder", () => {
  it("requests an access token then creates an order with the given total", async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: string, init?: any) => {
      calls.push(url);
      if (url.endsWith("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
      }
      if (url.endsWith("/v2/checkout/orders")) {
        const body = JSON.parse(init.body);
        expect(body.purchase_units[0].amount.value).toBe("72.00");
        expect(init.headers.Authorization).toBe("Bearer tok");
        return new Response(JSON.stringify({ id: "order-123" }), { status: 201 });
      }
      throw new Error("unexpected URL " + url);
    }) as any;

    const result = await createPayPalOrder(7200, "USD");
    expect(result.id).toBe("order-123");
    expect(calls).toHaveLength(2);
  });
});

afterAll(() => {
  global.fetch = originalFetch;
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/paypal'`.

- [ ] **Step 3: Implement `src/lib/paypal.ts`**

```ts
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
```

- [ ] **Step 4: Run and verify the test passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Implement the create-order API route**

Create `src/app/api/paypal/create-order/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { computeSubtotalCents, computeTotalCents } from "@/lib/pricing";
import { getShippingZoneForCountry } from "@/lib/shipping";
import { createPayPalOrder } from "@/lib/paypal";

export async function POST(req: NextRequest) {
  const { items, countryCode } = await req.json();
  const variantIds = items.map((i: { variantId: string }) => i.variantId);

  const supabase = createAdminSupabaseClient();
  const { data: variants, error } = await supabase
    .from("product_variants")
    .select("id, price_cents, stock")
    .in("id", variantIds);
  if (error || !variants) {
    return NextResponse.json({ error: "invalid_items" }, { status: 400 });
  }

  const lines = items.map((i: { variantId: string; quantity: number }) => {
    const variant = variants.find((v) => v.id === i.variantId);
    if (!variant) throw new Error("variant not found");
    return { unitPriceCents: variant.price_cents, quantity: i.quantity };
  });
  const subtotal = computeSubtotalCents(lines);

  const { data: zones } = await supabase.from("shipping_zones").select("*");
  const zone = getShippingZoneForCountry(
    countryCode,
    (zones ?? []).map((z) => ({
      id: z.id,
      name: z.name,
      countryCodes: z.country_codes,
      rateCents: z.rate_cents,
    }))
  );
  if (!zone) return NextResponse.json({ error: "no_shipping_zone" }, { status: 400 });

  const total = computeTotalCents(subtotal, zone.rateCents);
  const paypalOrder = await createPayPalOrder(total, "USD");

  return NextResponse.json({ paypalOrderId: paypalOrder.id });
}
```

- [ ] **Step 6: Wire the Smart Buttons into the checkout page**

Edit `src/app/[locale]/checkout/page.tsx`: wrap the page content in `PayPalScriptProvider` and replace the placeholder `<div id="paypal-button-container" />` with `<PayPalButtons>`:

```tsx
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
```

```tsx
<PayPalScriptProvider options={{ clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID!, currency: "USD" }}>
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
    onApprove={async (data) => {
      // capture handled in Task 12
    }}
  />
</PayPalScriptProvider>
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: create PayPal orders from server-verified cart totals"
```

---

### Task 12: PayPal capture, atomic stock decrement, order persistence

**Files:**
- Create: `src/app/api/paypal/capture-order/route.ts`
- Modify: `src/app/[locale]/checkout/page.tsx`
- Test: `tests/unit/capture-order.test.ts`

**Interfaces:**
- Consumes: `capturePayPalOrder` (Task 11), `createAdminSupabaseClient` (Task 2), `computeSubtotalCents`/`computeTotalCents` (Task 5), `getShippingZoneForCountry` (Task 5).
- Produces: `POST /api/paypal/capture-order` returning `{ orderId: string }` on success; row in `orders`/`order_items`; decremented `product_variants.stock`.
- Consumed by: Task 13 (confirmation page redirects to `/checkout/confirmation/[orderId]`, email sender reads the created order).

- [ ] **Step 1: Write the failing test for the capture route's core logic**

Since the route itself is thin glue over Supabase/PayPal, extract the testable part — atomic stock decrement — as a pure-ish function first.

Create `tests/unit/capture-order.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { buildOrderRecord } from "@/lib/paypal";

describe("buildOrderRecord", () => {
  it("computes subtotal, shipping, and total from variants and zone", () => {
    const record = buildOrderRecord({
      items: [{ variantId: "v1", quantity: 2 }],
      variants: [{ id: "v1", price_cents: 1000, stock: 5 }],
      zone: { id: "z1", rateCents: 500 },
      customer: {
        name: "Ana",
        email: "ana@example.com",
        address: "Calle 1",
        city: "Bogota",
        countryCode: "CO",
      },
      locale: "es",
      paypalOrderId: "order-123",
    });

    expect(record.order.subtotal_cents).toBe(2000);
    expect(record.order.shipping_cents).toBe(500);
    expect(record.order.total_cents).toBe(2500);
    expect(record.items[0]).toMatchObject({ variant_id: "v1", quantity: 2, unit_price_cents: 1000 });
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm test`
Expected: FAIL — `buildOrderRecord is not exported`.

- [ ] **Step 3: Add `buildOrderRecord` to `src/lib/paypal.ts`**

Append to `src/lib/paypal.ts`:

```ts
import { computeSubtotalCents, computeTotalCents } from "./pricing";

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
```

- [ ] **Step 4: Run and verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Implement the capture-order route**

Create `src/app/api/paypal/capture-order/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { capturePayPalOrder, buildOrderRecord } from "@/lib/paypal";
import { getShippingZoneForCountry } from "@/lib/shipping";
import { sendOrderConfirmationEmail, sendAdminNewOrderEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { paypalOrderId, items, customer, locale } = await req.json();

  const capture = await capturePayPalOrder(paypalOrderId);
  if (capture.status !== "COMPLETED") {
    return NextResponse.json({ error: "payment_not_completed" }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  const variantIds = items.map((i: { variantId: string }) => i.variantId);
  const { data: variants } = await supabase
    .from("product_variants")
    .select("id, price_cents, stock")
    .in("id", variantIds);

  const { data: zones } = await supabase.from("shipping_zones").select("*");
  const zone = getShippingZoneForCountry(
    customer.countryCode,
    (zones ?? []).map((z) => ({ id: z.id, name: z.name, countryCodes: z.country_codes, rateCents: z.rate_cents }))
  );
  if (!zone || !variants) {
    return NextResponse.json({ error: "invalid_order" }, { status: 400 });
  }

  const record = buildOrderRecord({
    items,
    variants,
    zone,
    customer,
    locale,
    paypalOrderId,
  });

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert(record.order)
    .select()
    .single();
  if (orderError || !order) {
    return NextResponse.json({ error: "order_insert_failed" }, { status: 500 });
  }

  await supabase
    .from("order_items")
    .insert(record.items.map((i) => ({ ...i, order_id: order.id })));

  // Atomic stock decrement per item; if a variant sold out between add-to-cart
  // and payment capture, the order still stands (already paid) but the admin
  // must review it manually via the admin panel.
  for (const item of record.items) {
    await supabase.rpc("decrement_variant_stock", {
      p_variant_id: item.variant_id,
      p_quantity: item.quantity,
    });
  }

  await sendOrderConfirmationEmail(order);
  await sendAdminNewOrderEmail(order);

  return NextResponse.json({ orderId: order.id });
}
```

- [ ] **Step 6: Add the atomic decrement function to the migration**

Append to `supabase/migrations/0001_init.sql`:

```sql
create or replace function decrement_variant_stock(p_variant_id uuid, p_quantity integer)
returns void as $$
begin
  update product_variants
  set stock = greatest(stock - p_quantity, 0)
  where id = p_variant_id;
end;
$$ language plpgsql;
```

- [ ] **Step 7: Wire `onApprove` in the checkout page**

Edit `src/app/[locale]/checkout/page.tsx`, replace the `onApprove` placeholder:

```tsx
onApprove={async (data) => {
  const res = await fetch("/api/paypal/capture-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paypalOrderId: data.orderID,
      items: state.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      customer: {
        name: form.name,
        email: form.email,
        address: form.address,
        city: form.city,
        countryCode: form.countryCode,
      },
      locale: "es",
    }),
  });
  const result = await res.json();
  if (result.orderId) {
    clear();
    router.push(`/checkout/confirmation/${result.orderId}`);
  }
}}
```

(add `const { state, clear } = useCart();` and `import { useRouter } from "../../../../i18n/routing";` `const router = useRouter();` at the top of the component)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: capture PayPal payment and persist order with atomic stock decrement"
```

---

### Task 13: Order confirmation page and email notifications

**Files:**
- Create: `src/lib/email.ts`, `src/app/[locale]/checkout/confirmation/[orderId]/page.tsx`
- Test: `tests/unit/email.test.ts`

**Interfaces:**
- Consumes: `Order` type (Task 2), Resend SDK.
- Produces: `sendOrderConfirmationEmail(order)`, `sendAdminNewOrderEmail(order)` — already called from Task 12's capture route.

- [ ] **Step 1: Write the failing test for the email content builder**

Create `tests/unit/email.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildOrderConfirmationEmail } from "@/lib/email";

describe("buildOrderConfirmationEmail", () => {
  it("builds a Spanish subject and body with the order total", () => {
    const email = buildOrderConfirmationEmail({
      customer_email: "ana@example.com",
      customer_name: "Ana",
      total_cents: 2500,
      locale: "es",
    } as any);
    expect(email.to).toBe("ana@example.com");
    expect(email.subject).toMatch(/pedido/i);
    expect(email.html).toContain("25.00");
  });

  it("builds an English subject when locale is en", () => {
    const email = buildOrderConfirmationEmail({
      customer_email: "ana@example.com",
      customer_name: "Ana",
      total_cents: 2500,
      locale: "en",
    } as any);
    expect(email.subject).toMatch(/order/i);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/email'`.

- [ ] **Step 3: Implement `src/lib/email.ts`**

```ts
import { Resend } from "resend";
import { formatUsd } from "./pricing";

const resend = new Resend(process.env.RESEND_API_KEY);

export function buildOrderConfirmationEmail(order: {
  customer_email: string;
  customer_name: string;
  total_cents: number;
  locale: "es" | "en";
}) {
  const isEs = order.locale === "es";
  return {
    to: order.customer_email,
    subject: isEs ? "Confirmacion de tu pedido - Celenny tops" : "Your order confirmation - Celenny tops",
    html: isEs
      ? `<p>Hola ${order.customer_name}, gracias por tu compra. Total: $${formatUsd(order.total_cents)} USD.</p>`
      : `<p>Hi ${order.customer_name}, thank you for your order. Total: $${formatUsd(order.total_cents)} USD.</p>`,
  };
}

export async function sendOrderConfirmationEmail(order: {
  customer_email: string;
  customer_name: string;
  total_cents: number;
  locale: "es" | "en";
}) {
  const email = buildOrderConfirmationEmail(order);
  await resend.emails.send({ from: "Celenny tops <orders@celennytops.com>", ...email });
}

export async function sendAdminNewOrderEmail(order: {
  id: string;
  customer_name: string;
  total_cents: number;
}) {
  await resend.emails.send({
    from: "Celenny tops <orders@celennytops.com>",
    to: process.env.ORDER_NOTIFICATION_EMAIL!,
    subject: `Nuevo pedido de ${order.customer_name}`,
    html: `<p>Pedido ${order.id} por $${formatUsd(order.total_cents)} USD.</p>`,
  });
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Build the confirmation page**

Create `src/app/[locale]/checkout/confirmation/[orderId]/page.tsx`:

```tsx
import { useTranslations } from "next-intl";

export default function ConfirmationPage() {
  const t = useTranslations("confirmation");
  return (
    <main className="px-6 py-16 text-center">
      <h1 className="font-script text-3xl">{t("title")}</h1>
      <p>{t("body")}</p>
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add order confirmation page and transactional emails"
```

---

### Task 14: Admin authentication

**Files:**
- Create: `src/app/admin/login/page.tsx`, `src/app/admin/layout.tsx`

**Interfaces:**
- Consumes: `createBrowserSupabaseClient` (Task 2), `createServerSupabaseClient` (Task 2).
- Produces: an auth-gated `/admin` layout redirecting unauthenticated visitors to `/admin/login`.

- [ ] **Step 1: Build the login page**

Create `src/app/admin/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/admin/products");
  }

  return (
    <main className="mx-auto mt-20 max-w-sm px-6">
      <h1 className="font-script text-3xl">Celenny tops admin</h1>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-red-600">{error}</p>}
        <button type="submit" className="rounded-full bg-brand-crimson px-6 py-2 text-white">
          Entrar
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Build the auth-gated admin layout**

Create `src/app/admin/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  return (
    <html lang="es">
      <body>
        <AdminNav />
        {children}
      </body>
    </html>
  );
}
```

Create `src/components/admin/AdminNav.tsx`:

```tsx
import Link from "next/link";

export function AdminNav() {
  return (
    <nav className="flex gap-4 border-b px-6 py-4">
      <Link href="/admin/products">Productos</Link>
      <Link href="/admin/orders">Pedidos</Link>
      <Link href="/admin/shipping-zones">Envio</Link>
    </nav>
  );
}
```

Note: `/admin/login` renders inside this same layout, which would redirect it into a loop. Move `admin/login/page.tsx` one level up so it does not inherit the gate: create `src/app/(admin-auth)/admin/login/page.tsx` instead, and adjust `AdminLayout` to only wrap `src/app/admin/(protected)/**`. Concretely:
- Move all protected admin pages (products, orders, shipping-zones — built in Tasks 15/16) under `src/app/admin/(protected)/`.
- Keep `src/app/admin/login/page.tsx` as a sibling route with its own minimal layout (no auth check).

- [ ] **Step 3: Manual verification**

Create an admin user in the Supabase dashboard (Authentication → Users → Add user) with a real email/password for each of the 2 administrators. Run `npm run dev`, visit `/admin/products` while logged out and confirm it redirects to `/admin/login`; log in and confirm it proceeds (products page is built in Task 15, a 404 here is expected until then). Stop the dev server after.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add admin login and auth-gated admin layout"
```

---

### Task 15: Admin product management (CRUD + image upload)

**Files:**
- Create: `src/app/admin/(protected)/products/page.tsx`, `src/app/admin/(protected)/products/new/page.tsx`, `src/app/admin/(protected)/products/[id]/page.tsx`, `src/components/admin/ProductForm.tsx`

**Interfaces:**
- Consumes: `createBrowserSupabaseClient` (Task 2), `Product`/`ProductVariant` types (Task 2).
- Produces: full CRUD UI for products and their variants, with images uploaded to a Supabase Storage bucket named `product-images`.

- [ ] **Step 1: Create the storage bucket**

In the Supabase dashboard, create a public Storage bucket named `product-images`. Document this as a manual setup step (same category as running the SQL migration in Task 2).

- [ ] **Step 2: Build the shared ProductForm**

Create `src/components/admin/ProductForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Product, ProductVariant } from "@/lib/types";

type VariantDraft = Pick<ProductVariant, "size" | "color" | "priceCents" | "sku" | "stock"> & {
  id?: string;
};

export function ProductForm({
  initialProduct,
  initialVariants,
}: {
  initialProduct?: Product;
  initialVariants?: ProductVariant[];
}) {
  const router = useRouter();
  const [nameEs, setNameEs] = useState(initialProduct?.nameEs ?? "");
  const [nameEn, setNameEn] = useState(initialProduct?.nameEn ?? "");
  const [descriptionEs, setDescriptionEs] = useState(initialProduct?.descriptionEs ?? "");
  const [descriptionEn, setDescriptionEn] = useState(initialProduct?.descriptionEn ?? "");
  const [images, setImages] = useState<string[]>(initialProduct?.images ?? []);
  const [isActive, setIsActive] = useState(initialProduct?.isActive ?? true);
  const [variants, setVariants] = useState<VariantDraft[]>(
    initialVariants?.map((v) => ({ ...v })) ?? [{ size: "", color: "", priceCents: 0, sku: "", stock: 0 }]
  );

  async function handleImageUpload(file: File) {
    const supabase = createBrowserSupabaseClient();
    const path = `${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file);
    if (error) return;
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    setImages((prev) => [...prev, data.publicUrl]);
  }

  async function handleSave() {
    const supabase = createBrowserSupabaseClient();
    const productRow = {
      name_es: nameEs,
      name_en: nameEn,
      description_es: descriptionEs,
      description_en: descriptionEn,
      images,
      is_active: isActive,
    };

    let productId = initialProduct?.id;
    if (productId) {
      await supabase.from("products").update(productRow).eq("id", productId);
    } else {
      const { data } = await supabase.from("products").insert(productRow).select().single();
      productId = data!.id;
    }

    for (const v of variants) {
      const variantRow = {
        product_id: productId,
        size: v.size || null,
        color: v.color || null,
        price_cents: v.priceCents,
        sku: v.sku,
        stock: v.stock,
      };
      if (v.id) {
        await supabase.from("product_variants").update(variantRow).eq("id", v.id);
      } else {
        await supabase.from("product_variants").insert(variantRow);
      }
    }

    router.push("/admin/products");
  }

  return (
    <div className="flex max-w-xl flex-col gap-3 px-6 py-6">
      <label>Nombre (ES) <input value={nameEs} onChange={(e) => setNameEs(e.target.value)} /></label>
      <label>Name (EN) <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></label>
      <label>Descripcion (ES) <textarea value={descriptionEs} onChange={(e) => setDescriptionEs(e.target.value)} /></label>
      <label>Description (EN) <textarea value={descriptionEn} onChange={(e) => setDescriptionEn(e.target.value)} /></label>
      <label>
        Activo
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
      </label>
      <input type="file" accept="image/*" onChange={(e) => e.target.files && handleImageUpload(e.target.files[0])} />
      <div className="flex gap-2">
        {images.map((src) => (
          <img key={src} src={src} width={80} height={80} alt="" />
        ))}
      </div>

      <h2>Variantes</h2>
      {variants.map((v, idx) => (
        <div key={v.id ?? idx} className="flex gap-2">
          <input placeholder="Talla" value={v.size ?? ""} onChange={(e) => {
            const next = [...variants]; next[idx] = { ...v, size: e.target.value }; setVariants(next);
          }} />
          <input placeholder="Color" value={v.color ?? ""} onChange={(e) => {
            const next = [...variants]; next[idx] = { ...v, color: e.target.value }; setVariants(next);
          }} />
          <input placeholder="Precio (centavos)" type="number" value={v.priceCents} onChange={(e) => {
            const next = [...variants]; next[idx] = { ...v, priceCents: Number(e.target.value) }; setVariants(next);
          }} />
          <input placeholder="SKU" value={v.sku} onChange={(e) => {
            const next = [...variants]; next[idx] = { ...v, sku: e.target.value }; setVariants(next);
          }} />
          <input placeholder="Stock" type="number" value={v.stock} onChange={(e) => {
            const next = [...variants]; next[idx] = { ...v, stock: Number(e.target.value) }; setVariants(next);
          }} />
        </div>
      ))}
      <button type="button" onClick={() => setVariants([...variants, { size: "", color: "", priceCents: 0, sku: "", stock: 0 }])}>
        + Variante
      </button>

      <button onClick={handleSave} className="mt-4 rounded-full bg-brand-crimson px-6 py-2 text-white">
        Guardar
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Build the list, new, and edit pages**

Create `src/app/admin/(protected)/products/page.tsx`:

```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function AdminProductsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: products } = await supabase.from("products").select("*").order("created_at", { ascending: false });

  return (
    <main className="px-6 py-6">
      <Link href="/admin/products/new">+ Nuevo producto</Link>
      <ul className="mt-4">
        {(products ?? []).map((p) => (
          <li key={p.id}>
            <Link href={`/admin/products/${p.id}`}>{p.name_es}</Link> {p.is_active ? "" : "(inactivo)"}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

Create `src/app/admin/(protected)/products/new/page.tsx`:

```tsx
import { ProductForm } from "@/components/admin/ProductForm";

export default function NewProductPage() {
  return <ProductForm />;
}
```

Create `src/app/admin/(protected)/products/[id]/page.tsx`:

```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProductForm } from "@/components/admin/ProductForm";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: product } = await supabase.from("products").select("*").eq("id", id).single();
  const { data: variants } = await supabase.from("product_variants").select("*").eq("product_id", id);

  const mappedProduct = {
    id: product.id,
    nameEs: product.name_es,
    nameEn: product.name_en,
    descriptionEs: product.description_es,
    descriptionEn: product.description_en,
    category: product.category,
    images: product.images,
    isActive: product.is_active,
  };
  const mappedVariants = (variants ?? []).map((v) => ({
    id: v.id,
    productId: v.product_id,
    size: v.size,
    color: v.color,
    priceCents: v.price_cents,
    sku: v.sku,
    stock: v.stock,
  }));

  return <ProductForm initialProduct={mappedProduct} initialVariants={mappedVariants} />;
}
```

- [ ] **Step 4: Manual verification**

Run `npm run dev`, log in at `/admin/login`, create a product with one variant and an uploaded image, confirm it appears at `/es/catalog` (only if `is_active` is checked and stock > 0 shows it as purchasable). Edit the product's stock to 0 and confirm the catalog now shows "Agotado". Stop the dev server after.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add admin product CRUD with variant and image management"
```

---

### Task 16: Admin orders and shipping zones management

**Files:**
- Create: `src/app/admin/(protected)/orders/page.tsx`, `src/app/admin/(protected)/orders/[id]/page.tsx`, `src/app/admin/(protected)/shipping-zones/page.tsx`, `src/components/admin/OrdersTable.tsx`, `src/components/admin/ShippingZonesForm.tsx`

**Interfaces:**
- Consumes: `createServerSupabaseClient`/`createBrowserSupabaseClient` (Task 2), `Order`/`OrderItem`/`ShippingZone` types (Task 2).

- [ ] **Step 1: Build the orders list and detail pages**

Create `src/components/admin/OrdersTable.tsx`:

```tsx
import Link from "next/link";
import { formatUsd } from "@/lib/pricing";

export function OrdersTable({ orders }: { orders: any[] }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr><th>Cliente</th><th>Total</th><th>Estado</th><th></th></tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id}>
            <td>{o.customer_name}</td>
            <td>{formatUsd(o.total_cents)}</td>
            <td>{o.status}</td>
            <td><Link href={`/admin/orders/${o.id}`}>Ver</Link></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Create `src/app/admin/(protected)/orders/page.tsx`:

```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { OrdersTable } from "@/components/admin/OrdersTable";

export default async function AdminOrdersPage() {
  const supabase = await createServerSupabaseClient();
  const { data: orders } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
  return (
    <main className="px-6 py-6">
      <OrdersTable orders={orders ?? []} />
    </main>
  );
}
```

Create `src/app/admin/(protected)/orders/[id]/page.tsx`:

```tsx
"use client";

import { use, useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { formatUsd } from "@/lib/pricing";

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [tracking, setTracking] = useState("");

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.from("orders").select("*").eq("id", id).single().then(({ data }) => {
      setOrder(data);
      setTracking(data?.tracking_number ?? "");
    });
    supabase.from("order_items").select("*, product_variants(*)").eq("order_id", id).then(({ data }) => setItems(data ?? []));
  }, [id]);

  async function markShipped() {
    const supabase = createBrowserSupabaseClient();
    await supabase.from("orders").update({ status: "shipped", tracking_number: tracking }).eq("id", id);
    setOrder({ ...order, status: "shipped", tracking_number: tracking });
  }

  if (!order) return null;

  return (
    <main className="px-6 py-6">
      <h1>{order.customer_name} — {order.customer_email}</h1>
      <p>{order.address_line}, {order.city}, {order.country_code}</p>
      <p>Estado: {order.status}</p>
      <ul>
        {items.map((i) => (
          <li key={i.id}>{i.quantity} x {i.product_variants?.sku} — {formatUsd(i.unit_price_cents * i.quantity)}</li>
        ))}
      </ul>
      <p>Total: {formatUsd(order.total_cents)}</p>
      <input placeholder="Numero de seguimiento" value={tracking} onChange={(e) => setTracking(e.target.value)} />
      <button onClick={markShipped}>Marcar como enviado</button>
    </main>
  );
}
```

- [ ] **Step 2: Build the shipping zones management page**

Create `src/components/admin/ShippingZonesForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { ShippingZone } from "@/lib/types";

export function ShippingZonesForm({ initialZones }: { initialZones: ShippingZone[] }) {
  const [zones, setZones] = useState(initialZones);

  async function saveZone(zone: ShippingZone) {
    const supabase = createBrowserSupabaseClient();
    await supabase
      .from("shipping_zones")
      .update({ name: zone.name, country_codes: zone.countryCodes, rate_cents: zone.rateCents })
      .eq("id", zone.id);
  }

  return (
    <div className="flex flex-col gap-4 px-6 py-6">
      {zones.map((zone, idx) => (
        <div key={zone.id} className="flex gap-2">
          <input
            value={zone.name}
            onChange={(e) => {
              const next = [...zones]; next[idx] = { ...zone, name: e.target.value }; setZones(next);
            }}
          />
          <input
            value={zone.countryCodes.join(",")}
            onChange={(e) => {
              const next = [...zones]; next[idx] = { ...zone, countryCodes: e.target.value.split(",").map((c) => c.trim().toUpperCase()) }; setZones(next);
            }}
          />
          <input
            type="number"
            value={zone.rateCents}
            onChange={(e) => {
              const next = [...zones]; next[idx] = { ...zone, rateCents: Number(e.target.value) }; setZones(next);
            }}
          />
          <button onClick={() => saveZone(zones[idx])}>Guardar</button>
        </div>
      ))}
    </div>
  );
}
```

Create `src/app/admin/(protected)/shipping-zones/page.tsx`:

```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ShippingZonesForm } from "@/components/admin/ShippingZonesForm";

export default async function AdminShippingZonesPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("shipping_zones").select("*").order("sort_order");
  const zones = (data ?? []).map((z) => ({ id: z.id, name: z.name, countryCodes: z.country_codes, rateCents: z.rate_cents }));
  return <ShippingZonesForm initialZones={zones} />;
}
```

- [ ] **Step 3: Manual verification**

Log in to `/admin`, open `/admin/orders`, confirm a test order placed in Task 12's flow appears; open its detail page, mark it as shipped with a tracking number, and confirm the status updates. Open `/admin/shipping-zones`, edit a rate, save, and confirm the checkout page (Task 10) reflects the new rate.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add admin orders management and shipping zones editor"
```

---

### Task 17: Deployment configuration

**Files:**
- Create: `README.md`
- Modify: `.env.local.example` (verify complete)

**Interfaces:** None (documentation/config only).

- [ ] **Step 1: Write setup and deployment instructions**

Create `README.md`:

```markdown
# Celenny Tops

## Local setup

1. `npm install`
2. Copy `.env.local.example` to `.env.local` and fill in:
   - Supabase project URL/keys (Project Settings > API)
   - PayPal sandbox client ID/secret (developer.paypal.com > My Apps & Credentials)
   - Resend API key (resend.com)
3. Run the SQL in `supabase/migrations/0001_init.sql` then `supabase/seed.sql`
   against your Supabase project (SQL Editor).
4. Create a public Storage bucket named `product-images`.
5. Create the 2 admin users under Authentication > Users.
6. `npm run dev`

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Add the same environment variables from `.env.local` in Vercel's
   Project Settings > Environment Variables — use PayPal **live**
   credentials and `PAYPAL_API_BASE=https://api-m.paypal.com` for
   production.
4. Deploy.

## Testing

`npm test` runs the unit test suite (pricing, shipping zones, cart, PayPal
order building, email content).
```

- [ ] **Step 2: Run the full test suite one last time**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: add setup and deployment instructions"
```

---

## Self-Review Notes

- **Spec coverage:** architecture/data model (Task 2), storefront catalog/product/cart (Tasks 8-9-7), checkout/PayPal payment (Tasks 10-12), admin panel — auth/products/orders/zones (Tasks 14-16), i18n (Task 3), email notifications (Task 13), identity visual (Task 4), USD currency (Global Constraints + Task 2 schema), shipping zones fixed-rate (Tasks 2, 5, 10-12, 16). All Fase 1 spec sections are covered.
- **Type consistency verified:** `ShippingZone { id, name, countryCodes, rateCents }` used identically across Tasks 2, 5, 10, 11, 12, 16. `CartItem` shape from Task 6 matches usage in Tasks 7, 9, 10. `buildOrderRecord`'s return shape (`order`/`items` with snake_case DB columns) matches the `orders`/`order_items` table columns from Task 2's migration.
- **Known follow-up (not a blocker):** Task 14's route-group restructuring (`admin/(protected)/`) is called out explicitly inside Task 14 itself so the engineer doesn't build the login redirect loop first and discover it in Task 15.
