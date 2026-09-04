# Envío en Santo Domingo + Depósito bancario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder CO local shipping zone with 4 priced Santo
Domingo sectors (VIMENPAQ), and add a bank-transfer payment method — scoped
to those same sectors — where the customer uploads a payment-proof photo and
an admin manually confirms it before the order is finalized.

**Architecture:** Extends the existing server-side order-draft validation
(`buildOrderDraft`) with an optional `sector` parameter so Santo Domingo
zones are matched by sector, not just country code. Bank transfer is a
second, parallel order-creation path (new API route) that reuses the same
anti-fraud draft-building logic as the PayPal path, but skips straight to a
`pending` order with an uploaded proof image instead of talking to PayPal.
A new admin-only route flips that order to `paid`, reusing the exact
stock-decrement + confirmation-email logic PayPal's capture route already
has — extracted once so both paths share it instead of duplicating it.

**Tech Stack:** Next.js 15 (App Router, Route Handlers), Supabase (Postgres,
Storage, Auth/RLS), Vitest, next-intl.

## Global Constraints

- All monetary amounts are integer USD cents. Convert to a decimal string
  only for display (`formatUsd`) — never compute with floats.
- TypeScript `strict: true`.
- Tests are Vitest (`*.test.ts`), colocated under `tests/unit/`, run via
  `npm test`.
- Every task ends with a commit.
- Never trust client-submitted prices or totals — the server always
  recomputes subtotal/shipping/total from the database before creating any
  order (PayPal or bank transfer).
- Bank transfer is offered **only** when the shipping country is `DO` and a
  Santo Domingo sector was selected — enforced server-side, not just hidden
  in the UI.

## Environment notes

Unlike the original Fase 1 build, this worktree's `.env.local` now holds
**real production credentials** (live Supabase project, PayPal sandbox,
Resend with the verified `celennytops.com` domain) — the site is deployed
and public at celennytops.com. `npm run dev` here talks to the real
database. Manual verification steps in this plan are safe (they read
existing data or create a small number of test rows), but:

- Any order created while manually testing Task 6 or Task 9 is a **real row
  in the production `orders` table**. That's fine to leave (it's how the
  Fase 1 PayPal flow was verified too), but don't invent large quantities of
  test data.
- Tasks 1 and 4 include a migration that must be run against the **live**
  Supabase project's SQL Editor, not just committed to the repo — the
  controlling session (not a subagent) does this step interactively with
  the human, the same way the Fase 1 migrations were applied. A dispatched
  subagent should stop and report back once the migration file is written
  and tested locally; it cannot open the Supabase dashboard itself.

## File Structure

```
supabase/
  migrations/
    0004_santo_domingo_shipping.sql   # new
    0005_bank_transfer_payments.sql   # new
  seed.sql                            # modified: DO sectors replace the CO row

src/
  lib/
    types.ts               # ShippingZone.sector, OrderRow.payment_method/payment_proof_path
    shipping.ts             # getShippingZoneForCountry gains a sector param
    order-draft.ts          # buildOrderDraft gains a sector param
    order-finalization.ts   # new: finalizeOrderPayment (extracted from capture-order)
    email.ts                # sendAdminNewOrderEmail gains an optional note
  components/
    storefront/
      BankTransferPayment.tsx   # new: account details + proof upload + submit
  app/
    api/
      paypal/create-order/route.ts     # passes customer.city as sector
      paypal/capture-order/route.ts    # uses the extracted finalizeOrderPayment
      bank-transfer/create-order/route.ts   # new
      admin/orders/[id]/mark-paid/route.ts  # new
      shipping-zones/route.ts          # includes sector in the response
    [locale]/
      checkout/page.tsx                       # DO sector dropdown, bank transfer block
      checkout/confirmation/[orderId]/page.tsx # payment-method-aware message
    admin/(protected)/orders/[id]/page.tsx     # proof image, "Marcar como pagado"

messages/es.json, messages/en.json   # bankTransfer + confirmation.pending* keys

tests/unit/
  shipping.test.ts                # extended
  order-draft.test.ts             # extended
  order-finalization.test.ts      # new
  bank-transfer-create-order.test.ts   # new
  mark-paid.test.ts               # new
```

---

### Task 1: Santo Domingo shipping zones — migration + seed

**Files:**
- Create: `supabase/migrations/0004_santo_domingo_shipping.sql`
- Modify: `supabase/seed.sql`

**Interfaces:**
- Produces: `shipping_zones` rows with a new `sector` column — 4 rows with
  `country_codes = ['DO']` and a `sector` matching one of `'Santo Domingo
  Oeste'`, `'Distrito Nacional'`, `'Santo Domingo Norte'`,
  `'Santo Domingo Este'`; every other existing row keeps `sector = null`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0004_santo_domingo_shipping.sql`:

```sql
-- Splits the placeholder "Pais local" (CO) zone into 4 priced Santo Domingo
-- sectors. The business operates from Dominican Republic, not Colombia -
-- CO was a seed placeholder from before the real shipping data existed.
alter table shipping_zones add column sector text;

delete from shipping_zones where name = 'Pais local' and country_codes = array['CO'];

insert into shipping_zones (name, country_codes, sector, rate_cents, sort_order) values
  ('Santo Domingo Oeste', array['DO'], 'Santo Domingo Oeste', 400, 1),
  ('Distrito Nacional', array['DO'], 'Distrito Nacional', 500, 2),
  ('Santo Domingo Norte', array['DO'], 'Santo Domingo Norte', 600, 3),
  ('Santo Domingo Este', array['DO'], 'Santo Domingo Este', 700, 4);
```

- [ ] **Step 2: Update the seed file to match**

In `supabase/seed.sql`, replace the line:

```sql
  ('Pais local', array['CO'], 500, 1),
```

with:

```sql
```

(remove it entirely) and add, in the same `insert into shipping_zones (...)
values` statement, matching column list `(name, country_codes, sector,
rate_cents, sort_order)`:

```sql
insert into shipping_zones (name, country_codes, sector, rate_cents, sort_order) values
  ('Santo Domingo Oeste', array['DO'], 'Santo Domingo Oeste', 400, 1),
  ('Distrito Nacional', array['DO'], 'Distrito Nacional', 500, 2),
  ('Santo Domingo Norte', array['DO'], 'Santo Domingo Norte', 600, 3),
  ('Santo Domingo Este', array['DO'], 'Santo Domingo Este', 700, 4),
  ('Latinoamerica', array['MX','AR','PE','CL','EC','BR','VE','UY','PY','BO'], null, 1200, 5),
  ('Resto del mundo', array['*'], null, 2500, 6);
```

(The existing Latinoamerica/Resto del mundo rows gain `null` in the new
`sector` position and their `sort_order` shifts up by 4 to stay after the
new rows — cosmetic, since nothing currently depends on `sort_order`
ordering.)

- [ ] **Step 3: Manual production step (controller, not a subagent)**

Run the exact SQL from Step 1 in the live Supabase project's SQL Editor.
Verify with:

```sql
select name, country_codes, sector, rate_cents from shipping_zones order by sort_order;
```

Expected: the 4 new Santo Domingo rows, no `Pais local`/`CO` row, and the
Latinoamerica/Resto del mundo rows unchanged except a `null` sector.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_santo_domingo_shipping.sql supabase/seed.sql
git commit -m "feat: replace CO placeholder shipping zone with Santo Domingo sectors"
```

---

### Task 2: Sector-aware shipping zone matching

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/shipping.ts`
- Modify: `src/lib/order-draft.ts`
- Modify: `src/app/admin/(protected)/shipping-zones/page.tsx`
- Test: `tests/unit/shipping.test.ts`
- Test: `tests/unit/order-draft.test.ts`

**Interfaces:**
- Consumes: `shipping_zones.sector` column from Task 1.
- Produces: `getShippingZoneForCountry(countryCode, zones, sector?)` — used
  by Task 3 (checkout page) and Task 6 (bank-transfer route).
  `buildOrderDraft(items, variants, zones, countryCode, sector?)` — used by
  the existing PayPal create-order route (Task 3) and the new bank-transfer
  route (Task 6).

- [ ] **Step 1: Update `ShippingZone` and `ShippingZoneRow`**

In `src/lib/types.ts`, change:

```ts
export type ShippingZone = {
  id: string;
  name: string;
  countryCodes: string[];
  rateCents: number;
};
```

to:

```ts
export type ShippingZone = {
  id: string;
  name: string;
  countryCodes: string[];
  sector: string | null;
  rateCents: number;
};
```

In `src/lib/order-draft.ts`, change:

```ts
export type ShippingZoneRow = {
  id: string;
  name: string;
  country_codes: string[];
  rate_cents: number;
};
```

to:

```ts
export type ShippingZoneRow = {
  id: string;
  name: string;
  country_codes: string[];
  sector: string | null;
  rate_cents: number;
};
```

and:

```ts
export function toShippingZone(row: ShippingZoneRow): ShippingZone {
  return {
    id: row.id,
    name: row.name,
    countryCodes: row.country_codes,
    rateCents: row.rate_cents,
  };
}
```

to:

```ts
export function toShippingZone(row: ShippingZoneRow): ShippingZone {
  return {
    id: row.id,
    name: row.name,
    countryCodes: row.country_codes,
    sector: row.sector,
    rateCents: row.rate_cents,
  };
}
```

- [ ] **Step 2: Fix the now-stricter `ShippingZone` construction site**

`sector` becomes a required field on `ShippingZone`. One place in the
codebase constructs a `ShippingZone` object without it and would fail to
compile otherwise (the checkout page and `/api/shipping-zones` are fixed in
Task 3, since that's where they're otherwise being touched — this one isn't
touched by any other task, so it's fixed here).

In `src/app/admin/(protected)/shipping-zones/page.tsx`, change:

```ts
  const zones = (data ?? []).map((z) => ({ id: z.id, name: z.name, countryCodes: z.country_codes, rateCents: z.rate_cents }));
```

to:

```ts
  const zones = (data ?? []).map((z) => ({ id: z.id, name: z.name, countryCodes: z.country_codes, sector: z.sector, rateCents: z.rate_cents }));
```

- [ ] **Step 3: Write the failing tests for `getShippingZoneForCountry`**

Replace `tests/unit/shipping.test.ts` entirely with:

```ts
import { describe, it, expect } from "vitest";
import { getShippingZoneForCountry } from "@/lib/shipping";
import type { ShippingZone } from "@/lib/types";

const zones: ShippingZone[] = [
  { id: "1", name: "Pais local", countryCodes: ["CO"], sector: null, rateCents: 500 },
  { id: "2", name: "Latinoamerica", countryCodes: ["MX", "AR"], sector: null, rateCents: 1200 },
  { id: "3", name: "Resto del mundo", countryCodes: ["*"], sector: null, rateCents: 2500 },
];

const doZones: ShippingZone[] = [
  { id: "sdo", name: "Santo Domingo Oeste", countryCodes: ["DO"], sector: "Santo Domingo Oeste", rateCents: 400 },
  { id: "dn", name: "Distrito Nacional", countryCodes: ["DO"], sector: "Distrito Nacional", rateCents: 500 },
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

describe("getShippingZoneForCountry with Santo Domingo sectors", () => {
  it("matches the zone whose sector equals the requested one", () => {
    expect(getShippingZoneForCountry("DO", doZones, "Distrito Nacional")?.id).toBe("dn");
  });

  it("returns null for DO without a sector", () => {
    expect(getShippingZoneForCountry("DO", doZones)).toBeNull();
  });

  it("returns null for DO with an unknown sector", () => {
    expect(getShippingZoneForCountry("DO", doZones, "Nowhere")).toBeNull();
  });

  it("is case-insensitive on the country code for DO too", () => {
    expect(getShippingZoneForCountry("do", doZones, "Santo Domingo Oeste")?.id).toBe("sdo");
  });

  it("still matches non-DO countries by country code, ignoring sector", () => {
    expect(getShippingZoneForCountry("MX", zones)?.id).toBe("2");
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test -- shipping.test.ts`
Expected: FAIL — `getShippingZoneForCountry` does not accept a third
argument yet, and the new `describe` block's assertions fail.

- [ ] **Step 5: Implement the sector-aware matching**

Replace `src/lib/shipping.ts` entirely with:

```ts
import type { ShippingZone } from "./types";

export function getShippingZoneForCountry(
  countryCode: string,
  zones: ShippingZone[],
  sector?: string
): ShippingZone | null {
  const upper = countryCode.toUpperCase();
  // Santo Domingo is split into sectors with their own rates - the country
  // code alone can't pick one, and there is no single "DO" zone to fall
  // back to if the caller didn't supply a sector.
  if (upper === "DO") {
    return zones.find((z) => z.countryCodes.includes("DO") && z.sector === sector) ?? null;
  }
  const exact = zones.find((z) => z.countryCodes.includes(upper));
  if (exact) return exact;
  return zones.find((z) => z.countryCodes.includes("*")) ?? null;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- shipping.test.ts`
Expected: PASS, all 9 tests.

- [ ] **Step 7: Write the failing tests for `buildOrderDraft`**

In `tests/unit/order-draft.test.ts`, update the existing `zones` fixture
near the top of the file to add `sector: null`:

```ts
const zones: ShippingZoneRow[] = [
  { id: "z1", name: "Pais local", country_codes: ["CO"], sector: null, rate_cents: 500 },
  { id: "z3", name: "Resto del mundo", country_codes: ["*"], sector: null, rate_cents: 2500 },
];
```

Then add this new `describe` block anywhere after the existing
`describe("buildOrderDraft", ...)` block:

```ts
describe("buildOrderDraft with Santo Domingo sectors", () => {
  const doZones: ShippingZoneRow[] = [
    { id: "sdo", name: "Santo Domingo Oeste", country_codes: ["DO"], sector: "Santo Domingo Oeste", rate_cents: 400 },
    { id: "dn", name: "Distrito Nacional", country_codes: ["DO"], sector: "Distrito Nacional", rate_cents: 500 },
  ];

  it("uses the rate of the matching sector", () => {
    const result = buildOrderDraft(
      [{ variantId: "v1", quantity: 1 }],
      variants,
      doZones,
      "DO",
      "Distrito Nacional"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft.shippingCents).toBe(500);
  });

  it("fails with no_shipping_zone when the sector is missing", () => {
    const result = buildOrderDraft([{ variantId: "v1", quantity: 1 }], variants, doZones, "DO");
    expect(result).toEqual({ ok: false, status: 400, body: { error: "no_shipping_zone" } });
  });
});
```

(`variants` is the fixture already declared at the top of this file, with
`v1` at `price_cents: 2500, stock: 3` — no change needed there.)

- [ ] **Step 8: Run the tests to verify the new ones fail**

Run: `npm test -- order-draft.test.ts`
Expected: FAIL — `buildOrderDraft` doesn't accept a `sector` argument yet.

- [ ] **Step 9: Thread `sector` through `buildOrderDraft`**

In `src/lib/order-draft.ts`, change the function signature and its call to
`getShippingZoneForCountry`:

```ts
export function buildOrderDraft(
  items: CartItemInput[],
  variants: VariantPricingRow[],
  zones: ShippingZoneRow[],
  countryCode: string,
  sector?: string
): OrderDraftResult {
```

and:

```ts
  const zone = getShippingZoneForCountry(countryCode, zones.map(toShippingZone), sector);
```

(only the function signature and this one call line change; the rest of
`buildOrderDraft`'s body is unchanged.)

- [ ] **Step 10: Run all tests to verify everything passes**

Run: `npm test`
Expected: PASS, all tests including the new ones.

- [ ] **Step 11: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add src/lib/types.ts src/lib/shipping.ts src/lib/order-draft.ts "src/app/admin/(protected)/shipping-zones/page.tsx" tests/unit/shipping.test.ts tests/unit/order-draft.test.ts
git commit -m "feat: match Santo Domingo shipping zones by sector"
```

---

### Task 3: Checkout UI — Santo Domingo sector dropdown

**Files:**
- Modify: `src/app/api/shipping-zones/route.ts`
- Modify: `src/app/api/paypal/create-order/route.ts`
- Modify: `src/app/[locale]/checkout/page.tsx`

**Interfaces:**
- Consumes: `getShippingZoneForCountry` and `buildOrderDraft` from Task 2.
- Produces: the checkout page's `zone` (a `ShippingZone | null`) is now
  reachable by Task 7 (bank-transfer block) via `zone?.sector`.

- [ ] **Step 1: Include `sector` in the shipping-zones API response**

In `src/app/api/shipping-zones/route.ts`, change:

```ts
    (data ?? []).map((z) => ({
      id: z.id,
      name: z.name,
      countryCodes: z.country_codes,
      rateCents: z.rate_cents,
    }))
```

to:

```ts
    (data ?? []).map((z) => ({
      id: z.id,
      name: z.name,
      countryCodes: z.country_codes,
      sector: z.sector,
      rateCents: z.rate_cents,
    }))
```

- [ ] **Step 2: Pass the customer's city as the sector hint in PayPal create-order**

In `src/app/api/paypal/create-order/route.ts`, change:

```ts
  const draftResult = buildOrderDraft(cartItems, variants, zones, customer.countryCode);
```

to:

```ts
  const draftResult = buildOrderDraft(cartItems, variants, zones, customer.countryCode, customer.city);
```

(`buildOrderDraft` only uses this fifth argument when `countryCode` is
`DO` — see Task 2 — so this is a no-op for every other country.)

- [ ] **Step 3: Add the sector dropdown and carrier label to the checkout page**

Replace `src/app/[locale]/checkout/page.tsx` entirely with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { useCart } from "@/context/CartContext";
import { computeSubtotalCents, computeTotalCents, formatUsd } from "@/lib/pricing";
import { getShippingZoneForCountry } from "@/lib/shipping";
import type { ShippingZone } from "@/lib/types";
import { useRouter } from "../../../../i18n/routing";

export default function CheckoutPage() {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const { state, clear } = useCart();
  const router = useRouter();
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
  const isDO = form.countryCode.toUpperCase() === "DO";
  const zone = form.countryCode
    ? getShippingZoneForCountry(form.countryCode, zones, isDO ? form.city : undefined)
    : null;
  const shipping = zone?.rateCents ?? 0;
  const total = computeTotalCents(subtotal, shipping);
  const doSectors = zones.filter((z) => z.countryCodes.includes("DO") && z.sector);

  return (
    <main className="px-6 py-10">
      <h1 className="font-script text-3xl">{t("title")}</h1>
      <form className="mt-6 flex max-w-md flex-col gap-3">
        <input placeholder={t("name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder={t("email")} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder={t("address")} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        {isDO ? (
          <select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
            <option value="">{t("city")}</option>
            {doSectors.map((z) => (
              <option key={z.id} value={z.sector!}>
                {z.sector} — ${formatUsd(z.rateCents)}
              </option>
            ))}
          </select>
        ) : (
          <input placeholder={t("city")} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        )}
        <input
          placeholder={t("country")}
          value={form.countryCode}
          onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase(), city: "" })}
          maxLength={2}
        />
      </form>
      <div className="mt-6">
        <p>
          {t("shipping")}
          {zone?.sector ? " (VIMENPAQ)" : ""}: ${formatUsd(shipping)}
        </p>
        <p>{t("total")}: ${formatUsd(total)}</p>
      </div>
      <div className="mt-6">
        <PayPalScriptProvider
          options={{ clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID!, currency: "USD" }}
        >
          <PayPalButtons
            disabled={!zone || state.items.length === 0}
            createOrder={async () => {
              const res = await fetch("/api/paypal/create-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  items: state.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
                  customer: {
                    name: form.name,
                    email: form.email,
                    address: form.address,
                    city: form.city,
                    countryCode: form.countryCode,
                  },
                  locale,
                }),
              });
              const data = await res.json();
              return data.paypalOrderId;
            }}
            onApprove={async (data) => {
              const res = await fetch("/api/paypal/capture-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ paypalOrderId: data.orderID }),
              });
              const result = await res.json();
              if (result.orderId) {
                clear();
                router.push(`/checkout/confirmation/${result.orderId}`);
              }
            }}
          />
        </PayPalScriptProvider>
      </div>
    </main>
  );
}
```

(This resets `form.city` whenever the country changes, so switching away
from DO doesn't leave a sector name sitting in a now-plain-text city field,
and switching into DO doesn't carry over free text as if it were a sector.
The bank-transfer block is added in Task 7 — not here.)

- [ ] **Step 4: Run the existing test suite**

Run: `npm test`
Expected: PASS (no test covers the checkout page directly, but this
confirms nothing else broke).

- [ ] **Step 5: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run `npm run dev`, open `/es/checkout` with at least one item in the cart:
- Type a country other than `DO` (e.g. `US`) — the city field is a normal
  text input.
- Type `DO` — the city field becomes a dropdown with 4 options, each
  showing its price. Selecting one updates "Envío (VIMENPAQ): $X.XX" and
  the total.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/shipping-zones/route.ts src/app/api/paypal/create-order/route.ts "src/app/[locale]/checkout/page.tsx"
git commit -m "feat: pick Santo Domingo shipping sector from a dropdown"
```

---

### Task 4: Bank-transfer schema — migration + types

**Files:**
- Create: `supabase/migrations/0005_bank_transfer_payments.sql`
- Modify: `src/lib/types.ts`
- Modify: `tests/unit/capture-order.test.ts`

**Interfaces:**
- Produces: `orders.payment_method` (`'paypal' | 'bank_transfer'`),
  `orders.payment_proof_path` (nullable), a private `payment-proofs`
  Storage bucket — consumed by Tasks 5, 6, 9, 10.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0005_bank_transfer_payments.sql`:

```sql
-- Adds a bank-transfer payment path alongside PayPal: orders can now record
-- which method was used and, for bank transfer, where the customer's
-- proof-of-payment image lives.
alter table orders
  add column payment_method text not null default 'paypal'
    check (payment_method in ('paypal', 'bank_transfer')),
  add column payment_proof_path text;

insert into storage.buckets (id, name, public) values ('payment-proofs', 'payment-proofs', false);

-- The bucket is private and nothing uploads to it except the server (via the
-- service-role client in the bank-transfer create-order route, which bypasses
-- RLS entirely), so the only policy needed is read access for admins
-- reviewing a proof in the admin panel.
create policy "admin read payment proofs" on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-proofs' and public.is_admin());
```

- [ ] **Step 2: Update `OrderRow`**

In `src/lib/types.ts`, change:

```ts
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
```

to:

```ts
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
  payment_method: "paypal" | "bank_transfer";
  payment_proof_path: string | null;
  created_at: string;
};
```

- [ ] **Step 3: Fix the now-stricter `OrderRow` fixture in existing tests**

In `tests/unit/capture-order.test.ts`, the `order` fixture is missing the
two new required fields. Change:

```ts
const order: OrderRow = {
  id: "order-1",
  customer_name: "Ana",
  customer_email: "ana@example.com",
  address_line: "Calle 1",
  city: "Bogota",
  country_code: "CO",
  shipping_zone_id: "z1",
  status: "pending",
  subtotal_cents: 5000,
  shipping_cents: 500,
  total_cents: 5500,
  locale: "es",
  tracking_number: null,
  paypal_order_id: "pp-1",
  created_at: "2026-01-01T00:00:00Z",
};
```

to:

```ts
const order: OrderRow = {
  id: "order-1",
  customer_name: "Ana",
  customer_email: "ana@example.com",
  address_line: "Calle 1",
  city: "Bogota",
  country_code: "CO",
  shipping_zone_id: "z1",
  status: "pending",
  subtotal_cents: 5000,
  shipping_cents: 500,
  total_cents: 5500,
  locale: "es",
  tracking_number: null,
  paypal_order_id: "pp-1",
  payment_method: "paypal",
  payment_proof_path: null,
  created_at: "2026-01-01T00:00:00Z",
};
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — `capture-order.test.ts` and everything else still green.

- [ ] **Step 5: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual production step (controller, not a subagent)**

Run the SQL from Step 1 in the live Supabase project's SQL Editor. Verify:

```sql
select payment_method, payment_proof_path from orders limit 1;
```

returns without error (existing rows get `payment_method = 'paypal'` from
the column default), and that **Storage** shows a new `payment-proofs`
bucket marked private.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0005_bank_transfer_payments.sql src/lib/types.ts tests/unit/capture-order.test.ts
git commit -m "feat: add payment_method/payment_proof_path columns and proofs bucket"
```

---

### Task 5: Extract shared order-finalization logic

**Files:**
- Create: `src/lib/order-finalization.ts`
- Modify: `src/app/api/paypal/capture-order/route.ts`
- Test: `tests/unit/order-finalization.test.ts`

**Interfaces:**
- Produces: `finalizeOrderPayment(supabase: SupabaseClient, order: OrderRow,
  items: OrderItemRow[]): Promise<void>` — consumed by `capture-order`
  (this task) and by Task 9's `mark-paid` route.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/order-finalization.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OrderItemRow, OrderRow } from "@/lib/types";

const { sendOrderConfirmationEmail, sendAdminNewOrderEmail } = vi.hoisted(() => ({
  sendOrderConfirmationEmail: vi.fn(async () => {}),
  sendAdminNewOrderEmail: vi.fn(async () => {}),
}));

vi.mock("@/lib/email", () => ({ sendOrderConfirmationEmail, sendAdminNewOrderEmail }));

import { finalizeOrderPayment } from "@/lib/order-finalization";

const order: OrderRow = {
  id: "order-1",
  customer_name: "Ana",
  customer_email: "ana@example.com",
  address_line: "Calle 1",
  city: "Distrito Nacional",
  country_code: "DO",
  shipping_zone_id: "z1",
  status: "paid",
  subtotal_cents: 5000,
  shipping_cents: 500,
  total_cents: 5500,
  locale: "es",
  tracking_number: null,
  paypal_order_id: null,
  payment_method: "bank_transfer",
  payment_proof_path: "bank-transfer/proof.jpg",
  created_at: "2026-01-01T00:00:00Z",
};

const items: OrderItemRow[] = [
  { id: "i1", order_id: "order-1", variant_id: "v1", quantity: 2, unit_price_cents: 2500 },
  { id: "i2", order_id: "order-1", variant_id: "v2", quantity: 1, unit_price_cents: 1000 },
];

function createSupabaseStub() {
  const rpcCalls: { name: string; args: unknown }[] = [];
  return {
    client: {
      rpc: async (name: string, args: unknown) => {
        rpcCalls.push({ name, args });
        return { error: null };
      },
    },
    rpcCalls,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("finalizeOrderPayment", () => {
  it("decrements stock once per order line", async () => {
    const stub = createSupabaseStub();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await finalizeOrderPayment(stub.client as any, order, items);
    expect(stub.rpcCalls).toEqual([
      { name: "decrement_variant_stock", args: { p_variant_id: "v1", p_quantity: 2 } },
      { name: "decrement_variant_stock", args: { p_variant_id: "v2", p_quantity: 1 } },
    ]);
  });

  it("sends the customer confirmation and admin notification emails", async () => {
    const stub = createSupabaseStub();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await finalizeOrderPayment(stub.client as any, order, items);
    expect(sendOrderConfirmationEmail).toHaveBeenCalledWith(order);
    expect(sendAdminNewOrderEmail).toHaveBeenCalledWith(order);
  });

  it("logs but does not throw when a stock decrement fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = { rpc: async () => ({ error: new Error("boom") }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(finalizeOrderPayment(client as any, order, items)).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- order-finalization.test.ts`
Expected: FAIL — `src/lib/order-finalization.ts` does not exist yet.

- [ ] **Step 3: Implement `finalizeOrderPayment`**

Create `src/lib/order-finalization.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendOrderConfirmationEmail, sendAdminNewOrderEmail } from "./email";
import type { OrderItemRow, OrderRow } from "./types";

/**
 * Everything that happens once an order is confirmed paid, regardless of how
 * payment was confirmed (PayPal capture, or an admin approving a bank
 * transfer proof): decrement stock for each line, then notify the customer
 * and the shop inbox. Stock decrement failures are logged, not thrown - a
 * paid order must not fail to close over a stock bookkeeping error.
 */
export async function finalizeOrderPayment(
  supabase: SupabaseClient,
  order: OrderRow,
  items: OrderItemRow[]
): Promise<void> {
  for (const item of items) {
    const { error: rpcError } = await supabase.rpc("decrement_variant_stock", {
      p_variant_id: item.variant_id,
      p_quantity: item.quantity,
    });
    if (rpcError) {
      console.error(`Stock decrement failed for order ${order.id}, variant ${item.variant_id}:`, rpcError);
    }
  }

  try {
    await sendOrderConfirmationEmail(order);
    await sendAdminNewOrderEmail(order);
  } catch (err) {
    console.error(`Email send failed for order ${order.id}:`, err);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- order-finalization.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Use it from `capture-order`**

Replace `src/app/api/paypal/capture-order/route.ts` entirely with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { capturePayPalOrder } from "@/lib/paypal";
import { sendAdminPaymentIssueEmail, type PaymentIssueInput } from "@/lib/email";
import { finalizeOrderPayment } from "@/lib/order-finalization";
import { formatUsd } from "@/lib/pricing";
import type { OrderItemRow, OrderRow } from "@/lib/types";

/**
 * A capture we refused to accept means the customer got an error page and the
 * order stays `pending` forever - so it has to reach a human. Logged always,
 * emailed best-effort.
 */
async function reportPaymentIssue(issue: PaymentIssueInput): Promise<void> {
  console.error(
    `PayPal capture rejected (${issue.reason}) for order ${issue.orderId} ` +
      `[paypal ${issue.paypalOrderId}]: expected $${formatUsd(issue.expectedCents)} USD, ` +
      `captured ${issue.capturedValue === null ? "none" : `$${issue.capturedValue} USD`}`
  );
  try {
    await sendAdminPaymentIssueEmail(issue);
  } catch (err) {
    console.error(`Payment issue alert email failed for order ${issue.orderId}:`, err);
  }
}

export async function POST(req: NextRequest) {
  const { paypalOrderId } = await req.json();
  if (!paypalOrderId) {
    return NextResponse.json({ error: "missing_paypal_order_id" }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  const { data: order, error: orderError } = (await supabase
    .from("orders")
    .select("*")
    .eq("paypal_order_id", paypalOrderId)
    .maybeSingle()) as { data: OrderRow | null; error: unknown };
  if (orderError || !order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }
  if (order.status === "paid") {
    // Already captured (e.g. a client retry) - idempotent success.
    return NextResponse.json({ orderId: order.id });
  }
  if (order.status !== "pending") {
    return NextResponse.json({ error: "invalid_order_status" }, { status: 409 });
  }

  const { data: items, error: itemsError } = (await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", order.id)) as { data: OrderItemRow[] | null; error: unknown };
  if (itemsError || !items) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  const capture = await capturePayPalOrder(paypalOrderId);
  const capturedValue: string | null =
    capture?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ?? null;

  if (capture?.status !== "COMPLETED") {
    await reportPaymentIssue({
      orderId: order.id,
      paypalOrderId,
      reason: "payment_not_completed",
      expectedCents: order.total_cents,
      capturedValue,
    });
    return NextResponse.json({ error: "payment_not_completed" }, { status: 400 });
  }

  const expectedValue = formatUsd(order.total_cents);
  if (capturedValue !== expectedValue) {
    // Payment captured but doesn't match what we authorized at create-order time.
    // Do not mark paid or fulfill; needs manual review.
    await reportPaymentIssue({
      orderId: order.id,
      paypalOrderId,
      reason: "amount_mismatch",
      expectedCents: order.total_cents,
      capturedValue,
    });
    return NextResponse.json({ error: "amount_mismatch" }, { status: 409 });
  }

  const { data: updatedOrder, error: updateError } = (await supabase
    .from("orders")
    .update({ status: "paid" })
    .eq("id", order.id)
    .eq("status", "pending")
    .select()
    .maybeSingle()) as { data: OrderRow | null; error: unknown };
  if (updateError) {
    return NextResponse.json({ error: "order_update_failed" }, { status: 500 });
  }
  if (!updatedOrder) {
    // Another concurrent request already flipped this order to paid first.
    // Payment was captured successfully either way, so this is a success from
    // the client's perspective - just don't decrement stock or send emails again.
    return NextResponse.json({ orderId: order.id });
  }

  await finalizeOrderPayment(supabase, updatedOrder, items);

  return NextResponse.json({ orderId: order.id });
}
```

(Only the imports and the block after the compare-and-swap update changed —
the status-check, capture, and amount-verification logic above it is
untouched.)

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — `capture-order.test.ts` passes unchanged (same observable
behavior: same RPC calls, same email calls, same responses), plus the new
`order-finalization.test.ts`.

- [ ] **Step 7: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/order-finalization.ts src/app/api/paypal/capture-order/route.ts tests/unit/order-finalization.test.ts
git commit -m "refactor: extract finalizeOrderPayment from capture-order"
```

---

### Task 6: Bank-transfer order creation route

**Files:**
- Modify: `src/lib/email.ts`
- Create: `src/app/api/bank-transfer/create-order/route.ts`
- Test: `tests/unit/bank-transfer-create-order.test.ts`

**Interfaces:**
- Consumes: `parseCartItems`, `buildOrderDraft` (Task 2),
  `createAdminSupabaseClient`, `sendAdminNewOrderEmail` (extended here).
- Produces: `POST /api/bank-transfer/create-order` — consumed by Task 7's
  checkout UI. Request: `multipart/form-data` with fields `items` (JSON
  string of `{variantId, quantity}[]`), `customer` (JSON string of
  `{name, email, address, city, countryCode}`), `locale` (`"es"` or
  `"en"`), `proof` (image file, ≤ 5 MB). Response on success: `{orderId:
  string}`.

- [ ] **Step 1: Let `sendAdminNewOrderEmail` carry an optional note**

In `src/lib/email.ts`, change:

```ts
export async function sendAdminNewOrderEmail(order: AdminNewOrderInput): Promise<void> {
  await getResendClient().emails.send({
    from: FROM_ADDRESS,
    to: process.env.ORDER_NOTIFICATION_EMAIL!,
    subject: `Nuevo pedido de ${order.customer_name}`,
    html: `<p>Pedido ${order.id} por $${formatUsd(order.total_cents)} USD.</p>`,
  });
}
```

to:

```ts
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
```

(Backward compatible — `capture-order`'s call via `finalizeOrderPayment`
passes no second argument, so its emails are unchanged.)

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/bank-transfer-create-order.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { createAdminSupabaseClient, sendAdminNewOrderEmail } = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
  sendAdminNewOrderEmail: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient }));
vi.mock("@/lib/email", () => ({ sendAdminNewOrderEmail }));

import { POST } from "@/app/api/bank-transfer/create-order/route";

type Result = { data: unknown; error: unknown };

const variants = [{ id: "v1", price_cents: 2500, stock: 3 }];
const zones = [
  { id: "z1", name: "Distrito Nacional", country_codes: ["DO"], sector: "Distrito Nacional", rate_cents: 500 },
];

function createSupabaseStub(opts: {
  variants: Result;
  zones: Result;
  upload?: { error: unknown };
  orderInsert?: Result;
  itemsInsert?: { error: unknown };
}) {
  const uploads: { path: string }[] = [];
  const inserts: { table: string; payload: unknown }[] = [];
  const client = {
    from(table: string) {
      if (table === "product_variants") {
        return { select: () => ({ in: async () => opts.variants }) };
      }
      if (table === "shipping_zones") {
        return { select: async () => opts.zones };
      }
      if (table === "orders") {
        return {
          insert: (payload: unknown) => {
            inserts.push({ table, payload });
            return {
              select: () => ({
                single: async () => opts.orderInsert ?? { data: null, error: null },
              }),
            };
          },
        };
      }
      if (table === "order_items") {
        return {
          insert: async (payload: unknown) => {
            inserts.push({ table, payload });
            return opts.itemsInsert ?? { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from: (_bucket: string) => ({
        upload: async (path: string) => {
          uploads.push({ path });
          return opts.upload ?? { error: null };
        },
      }),
    },
  };
  return { client, uploads, inserts };
}

function buildForm(
  overrides: Partial<{
    items: unknown;
    customer: unknown;
    locale: string;
    proof: File | null;
  }> = {}
) {
  const form = new FormData();
  form.set("items", JSON.stringify(overrides.items ?? [{ variantId: "v1", quantity: 1 }]));
  form.set(
    "customer",
    JSON.stringify(
      overrides.customer ?? {
        name: "Ana",
        email: "ana@example.com",
        address: "Calle 1",
        city: "Distrito Nacional",
        countryCode: "DO",
      }
    )
  );
  form.set("locale", overrides.locale ?? "es");
  const proof =
    overrides.proof === undefined ? new File(["x"], "proof.jpg", { type: "image/jpeg" }) : overrides.proof;
  if (proof) form.set("proof", proof);
  return form;
}

function post(form: FormData) {
  return POST({ formData: async () => form } as unknown as NextRequest);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/bank-transfer/create-order", () => {
  it("creates a pending bank-transfer order and uploads the proof", async () => {
    const stub = createSupabaseStub({
      variants: { data: variants, error: null },
      zones: { data: zones, error: null },
      orderInsert: { data: { id: "order-1", customer_name: "Ana", total_cents: 3000 }, error: null },
    });
    createAdminSupabaseClient.mockReturnValue(stub.client);

    const res = await post(buildForm());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orderId: "order-1" });
    expect(stub.uploads).toHaveLength(1);
    expect(stub.uploads[0].path).toMatch(/^bank-transfer\/.+\.jpg$/);
    const orderInsert = stub.inserts.find((i) => i.table === "orders");
    expect(orderInsert?.payload).toMatchObject({
      status: "pending",
      payment_method: "bank_transfer",
      total_cents: 3000,
    });
    expect(sendAdminNewOrderEmail).toHaveBeenCalledTimes(1);
  });

  it("rejects a country other than DO", async () => {
    const res = await post(
      buildForm({ customer: { name: "A", email: "a@b.com", address: "x", city: "x", countryCode: "US" } })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unsupported_country" });
  });

  it("rejects a request with no proof file", async () => {
    const res = await post(buildForm({ proof: null }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_proof" });
  });

  it("rejects a non-image proof file", async () => {
    const res = await post(buildForm({ proof: new File(["x"], "proof.pdf", { type: "application/pdf" }) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_proof_type" });
  });

  it("passes through the insufficient-stock rejection from buildOrderDraft without uploading", async () => {
    const stub = createSupabaseStub({
      variants: { data: [{ id: "v1", price_cents: 2500, stock: 0 }], error: null },
      zones: { data: zones, error: null },
    });
    createAdminSupabaseClient.mockReturnValue(stub.client);

    const res = await post(buildForm());

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "insufficient_stock" });
    expect(stub.uploads).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- bank-transfer-create-order.test.ts`
Expected: FAIL — the route module does not exist yet.

- [ ] **Step 4: Implement the route**

Create `src/app/api/bank-transfer/create-order/route.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- bank-transfer-create-order.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 6: Run the full suite and the type checker**

Run: `npm test && npx tsc --noEmit`
Expected: everything passes, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/email.ts src/app/api/bank-transfer/create-order/route.ts tests/unit/bank-transfer-create-order.test.ts
git commit -m "feat: add bank-transfer order creation with proof upload"
```

---

### Task 7: Checkout UI — bank transfer payment block

**Files:**
- Create: `src/components/storefront/BankTransferPayment.tsx`
- Modify: `messages/es.json`
- Modify: `messages/en.json`
- Modify: `src/app/[locale]/checkout/page.tsx`

**Interfaces:**
- Consumes: `POST /api/bank-transfer/create-order` (Task 6).
- Produces: renders only when `zone?.sector` is set (i.e. only for the 4
  Santo Domingo sectors from Task 1-3).

- [ ] **Step 1: Add translation keys**

In `messages/es.json`, change the `"checkout"` object from:

```json
  "checkout": { "title": "Finalizar compra", "name": "Nombre completo", "email": "Correo electronico", "address": "Direccion", "city": "Ciudad", "country": "Pais", "shipping": "Envio", "total": "Total", "pay": "Pagar con PayPal" },
```

to:

```json
  "checkout": { "title": "Finalizar compra", "name": "Nombre completo", "email": "Correo electronico", "address": "Direccion", "city": "Ciudad", "country": "Pais", "shipping": "Envio", "total": "Total", "pay": "Pagar con PayPal", "bankTransfer": { "title": "Deposito bancario", "holder": "Titular", "holderId": "Cedula", "instructions": "Por favor, enviame el comprobante de pago.", "submit": "Enviar comprobante y confirmar pedido", "error": "No pudimos enviar tu comprobante. Intenta de nuevo." } },
```

In `messages/en.json`, change the `"checkout"` object from:

```json
  "checkout": { "title": "Checkout", "name": "Full name", "email": "Email", "address": "Address", "city": "City", "country": "Country", "shipping": "Shipping", "total": "Total", "pay": "Pay with PayPal" },
```

to:

```json
  "checkout": { "title": "Checkout", "name": "Full name", "email": "Email", "address": "Address", "city": "City", "country": "Country", "shipping": "Shipping", "total": "Total", "pay": "Pay with PayPal", "bankTransfer": { "title": "Bank transfer", "holder": "Account holder", "holderId": "ID number", "instructions": "Please send me your payment proof.", "submit": "Send proof and confirm order", "error": "We could not send your proof. Please try again." } },
```

- [ ] **Step 2: Create the `BankTransferPayment` component**

Create `src/components/storefront/BankTransferPayment.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const ACCOUNTS = [
  { bank: "BHD", number: "33126420012" },
  { bank: "Banreservas", number: "9605666479" },
  { bank: "Qik", number: "1006892608" },
];
const ACCOUNT_HOLDER = "Celenny Caraballo";
const ACCOUNT_HOLDER_ID = "402-0399758-6";

export function BankTransferPayment({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (proof: File) => Promise<void>;
}) {
  const t = useTranslations("checkout.bankTransfer");
  const [proof, setProof] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!proof) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(proof);
    } catch {
      setError(t("error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 border-t pt-6">
      <h2 className="font-script text-2xl">{t("title")}</h2>
      <ul className="mt-2 text-sm">
        {ACCOUNTS.map((a) => (
          <li key={a.bank}>
            {a.bank}: {a.number}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm">
        {t("holder")}: {ACCOUNT_HOLDER} — {t("holderId")}: {ACCOUNT_HOLDER_ID}
      </p>
      <p className="mt-2">{t("instructions")}</p>
      <input type="file" accept="image/*" onChange={(e) => setProof(e.target.files?.[0] ?? null)} className="mt-3" />
      {error && (
        <p role="alert" className="mt-2 text-red-600">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={disabled || !proof || submitting}
        onClick={handleSubmit}
        className="mt-3 rounded-full bg-brand-crimson px-6 py-2 text-white disabled:opacity-40"
      >
        {t("submit")}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Wire it into the checkout page**

In `src/app/[locale]/checkout/page.tsx`, add the import:

```ts
import { BankTransferPayment } from "@/components/storefront/BankTransferPayment";
```

Add this function inside the `CheckoutPage` component, alongside the
existing `PayPalButtons` handlers:

```tsx
  async function submitBankTransfer(proof: File) {
    const formData = new FormData();
    formData.set(
      "items",
      JSON.stringify(state.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })))
    );
    formData.set(
      "customer",
      JSON.stringify({
        name: form.name,
        email: form.email,
        address: form.address,
        city: form.city,
        countryCode: form.countryCode,
      })
    );
    formData.set("locale", locale);
    formData.set("proof", proof);

    const res = await fetch("/api/bank-transfer/create-order", { method: "POST", body: formData });
    if (!res.ok) throw new Error("bank_transfer_failed");
    const result = await res.json();
    clear();
    router.push(`/checkout/confirmation/${result.orderId}?method=bank_transfer`);
  }
```

Add the block after the closing `</div>` of the `PayPalScriptProvider`
section (i.e. after the existing `<div className="mt-6">...PayPalScriptProvider...</div>`,
still inside `<main>`):

```tsx
      {zone?.sector && (
        <BankTransferPayment disabled={!zone || state.items.length === 0} onSubmit={submitBankTransfer} />
      )}
```

- [ ] **Step 4: Run the full test suite and type checker**

Run: `npm test && npx tsc --noEmit`
Expected: everything passes, no type errors.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, add an item to the cart, open `/es/checkout`, set
country `DO` and pick a sector. Confirm:
- The bank transfer block appears below the PayPal buttons, showing the 3
  accounts, the holder name/cédula, and the instructions.
- The submit button stays disabled until a file is chosen.
- Choosing a country other than `DO` hides the block entirely.

- [ ] **Step 6: Commit**

```bash
git add messages/es.json messages/en.json src/components/storefront/BankTransferPayment.tsx "src/app/[locale]/checkout/page.tsx"
git commit -m "feat: add bank transfer payment option to checkout"
```

---

### Task 8: Payment-method-aware confirmation message

**Files:**
- Modify: `messages/es.json`
- Modify: `messages/en.json`
- Modify: `src/app/[locale]/checkout/confirmation/[orderId]/page.tsx`

**Interfaces:**
- Consumes: the `?method=bank_transfer` query param set by Task 7's
  `submitBankTransfer` redirect.

- [ ] **Step 1: Add the pending-confirmation translation keys**

In `messages/es.json`, change:

```json
  "confirmation": { "title": "Gracias por tu compra", "body": "Te enviamos un correo con los detalles de tu pedido." }
```

to:

```json
  "confirmation": { "title": "Gracias por tu compra", "body": "Te enviamos un correo con los detalles de tu pedido.", "pendingTitle": "Tu pedido esta en proceso", "pendingBody": "Estamos verificando tu pago. Te contactaremos en cuanto lo confirmemos." }
```

In `messages/en.json`, change:

```json
  "confirmation": { "title": "Thank you for your order", "body": "We sent you an email with your order details." }
```

to:

```json
  "confirmation": { "title": "Thank you for your order", "body": "We sent you an email with your order details.", "pendingTitle": "Your order is being processed", "pendingBody": "We are verifying your payment. We will contact you once it is confirmed." }
```

- [ ] **Step 2: Read the query param on the confirmation page**

Replace `src/app/[locale]/checkout/confirmation/[orderId]/page.tsx`
entirely with:

```tsx
"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

function ConfirmationContent() {
  const t = useTranslations("confirmation");
  const searchParams = useSearchParams();
  const isBankTransfer = searchParams.get("method") === "bank_transfer";

  return (
    <main className="px-6 py-16 text-center">
      <h1 className="font-script text-3xl">{isBankTransfer ? t("pendingTitle") : t("title")}</h1>
      <p>{isBankTransfer ? t("pendingBody") : t("body")}</p>
    </main>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmationContent />
    </Suspense>
  );
}
```

(`useSearchParams` requires a Client Component and Next.js recommends
wrapping it in `Suspense` so the page can still be statically analyzed at
build time — the actual client always has the query param available
immediately, so `fallback={null}` is never visibly shown in practice.)

- [ ] **Step 3: Run the full test suite and type checker**

Run: `npm test && npx tsc --noEmit`
Expected: everything passes, no type errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev` and open:
- `/es/checkout/confirmation/test-id` — shows "Gracias por tu compra".
- `/es/checkout/confirmation/test-id?method=bank_transfer` — shows "Tu
  pedido esta en proceso".

- [ ] **Step 5: Commit**

```bash
git add messages/es.json messages/en.json "src/app/[locale]/checkout/confirmation/[orderId]/page.tsx"
git commit -m "feat: show a pending message on bank-transfer order confirmation"
```

---

### Task 9: Admin route to approve a bank-transfer payment

**Files:**
- Create: `src/app/api/admin/orders/[id]/mark-paid/route.ts`
- Test: `tests/unit/mark-paid.test.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient` (session-aware, not service-role —
  the existing `admin update orders` RLS policy is what authorizes the
  write), `finalizeOrderPayment` (Task 5).
- Produces: `POST /api/admin/orders/[id]/mark-paid` — consumed by Task 10's
  admin UI. Response on success: `{orderId: string}`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/mark-paid.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { OrderItemRow, OrderRow } from "@/lib/types";

const { createServerSupabaseClient, finalizeOrderPayment } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  finalizeOrderPayment: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("@/lib/order-finalization", () => ({ finalizeOrderPayment }));

import { POST } from "@/app/api/admin/orders/[id]/mark-paid/route";

const order: OrderRow = {
  id: "order-1",
  customer_name: "Ana",
  customer_email: "ana@example.com",
  address_line: "Calle 1",
  city: "Distrito Nacional",
  country_code: "DO",
  shipping_zone_id: "z1",
  status: "pending",
  subtotal_cents: 5000,
  shipping_cents: 500,
  total_cents: 5500,
  locale: "es",
  tracking_number: null,
  paypal_order_id: null,
  payment_method: "bank_transfer",
  payment_proof_path: "bank-transfer/proof.jpg",
  created_at: "2026-01-01T00:00:00Z",
};

const items: OrderItemRow[] = [
  { id: "i1", order_id: "order-1", variant_id: "v1", quantity: 1, unit_price_cents: 2500 },
];

type Result = { data: unknown; error: unknown };

function createSupabaseStub(opts: {
  authedUser?: { email: string } | null;
  order: Result;
  update?: Result;
  items?: Result;
}) {
  const updates: unknown[] = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: opts.authedUser === undefined ? { email: "admin@celennytops.com" } : opts.authedUser },
      }),
    },
    from(table: string) {
      if (table === "orders") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => opts.order,
            }),
          }),
          update: (payload: unknown) => {
            updates.push(payload);
            return {
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => opts.update ?? { data: null, error: null },
                  }),
                }),
              }),
            };
          },
        };
      }
      if (table === "order_items") {
        return {
          select: () => ({
            eq: async () => opts.items ?? { data: [], error: null },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client, updates };
}

function post(id: string) {
  return POST({} as NextRequest, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/orders/[id]/mark-paid", () => {
  it("flips a pending bank-transfer order to paid and finalizes it", async () => {
    const stub = createSupabaseStub({
      order: { data: order, error: null },
      update: { data: { ...order, status: "paid" }, error: null },
      items: { data: items, error: null },
    });
    createServerSupabaseClient.mockResolvedValue(stub.client);

    const res = await post("order-1");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orderId: "order-1" });
    expect(finalizeOrderPayment).toHaveBeenCalledWith(stub.client, { ...order, status: "paid" }, items);
  });

  it("rejects a PayPal order even if it is pending", async () => {
    const stub = createSupabaseStub({
      order: { data: { ...order, payment_method: "paypal" }, error: null },
    });
    createServerSupabaseClient.mockResolvedValue(stub.client);

    const res = await post("order-1");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "not_bank_transfer" });
    expect(finalizeOrderPayment).not.toHaveBeenCalled();
  });

  it("rejects an already-paid order", async () => {
    const stub = createSupabaseStub({
      order: { data: { ...order, status: "paid" }, error: null },
    });
    createServerSupabaseClient.mockResolvedValue(stub.client);

    const res = await post("order-1");

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "invalid_order_status" });
  });

  it("returns 409 without finalizing when the update affects no row (RLS block or lost race)", async () => {
    const stub = createSupabaseStub({
      order: { data: order, error: null },
      update: { data: null, error: null },
    });
    createServerSupabaseClient.mockResolvedValue(stub.client);

    const res = await post("order-1");

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_updated" });
    expect(finalizeOrderPayment).not.toHaveBeenCalled();
  });

  it("401s when there is no signed-in user", async () => {
    const stub = createSupabaseStub({ authedUser: null, order: { data: order, error: null } });
    createServerSupabaseClient.mockResolvedValue(stub.client);

    const res = await post("order-1");

    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- mark-paid.test.ts`
Expected: FAIL — the route module does not exist yet.

- [ ] **Step 3: Implement the route**

Create `src/app/api/admin/orders/[id]/mark-paid/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { finalizeOrderPayment } from "@/lib/order-finalization";
import type { OrderItemRow, OrderRow } from "@/lib/types";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: order, error: orderError } = (await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle()) as { data: OrderRow | null; error: unknown };
  if (orderError || !order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }
  if (order.payment_method !== "bank_transfer") {
    return NextResponse.json({ error: "not_bank_transfer" }, { status: 400 });
  }
  if (order.status !== "pending") {
    return NextResponse.json({ error: "invalid_order_status" }, { status: 409 });
  }

  // The update itself is what RLS's "admin update orders" policy gates - a
  // non-admin's session client would have this affect 0 rows, same as a lost
  // compare-and-swap race, and both fall into the branch below.
  const { data: updatedOrder, error: updateError } = (await supabase
    .from("orders")
    .update({ status: "paid" })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .maybeSingle()) as { data: OrderRow | null; error: unknown };
  if (updateError) {
    return NextResponse.json({ error: "order_update_failed" }, { status: 500 });
  }
  if (!updatedOrder) {
    return NextResponse.json({ error: "not_updated" }, { status: 409 });
  }

  const { data: items } = (await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", id)) as { data: OrderItemRow[] | null; error: unknown };

  await finalizeOrderPayment(supabase, updatedOrder, items ?? []);

  return NextResponse.json({ orderId: updatedOrder.id });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- mark-paid.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Run the full suite and the type checker**

Run: `npm test && npx tsc --noEmit`
Expected: everything passes, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/orders/[id]/mark-paid/route.ts tests/unit/mark-paid.test.ts
git commit -m "feat: add admin route to approve a bank-transfer payment"
```

---

### Task 10: Admin order detail — proof review and approval

**Files:**
- Modify: `src/app/admin/(protected)/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/orders/[id]/mark-paid` (Task 9),
  `order.payment_method` / `order.payment_proof_path` (Task 4).

- [ ] **Step 1: Show payment method, the proof image, and the approval button**

Replace `src/app/admin/(protected)/orders/[id]/page.tsx` entirely with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { formatUsd } from "@/lib/pricing";
import type { OrderItemRow, OrderRow, ProductVariant } from "@/lib/types";

/** order_items rows joined with their variant, as selected below. */
type OrderItemWithVariant = OrderItemRow & {
  product_variants: { sku: ProductVariant["sku"] } | null;
};

export default function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemWithVariant[]>([]);
  const [tracking, setTracking] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    params.then((p) => {
      if (cancelled) return;
      setId(p.id);
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  useEffect(() => {
    if (!id) return;
    const supabase = createBrowserSupabaseClient();
    supabase.from("orders").select("*").eq("id", id).single().then(({ data }) => {
      setOrder(data);
      setTracking(data?.tracking_number ?? "");
    });
    supabase.from("order_items").select("*, product_variants(*)").eq("order_id", id).then(({ data }) => setItems(data ?? []));
  }, [id]);

  useEffect(() => {
    if (!order?.payment_proof_path) return;
    const supabase = createBrowserSupabaseClient();
    supabase.storage
      .from("payment-proofs")
      .createSignedUrl(order.payment_proof_path, 300)
      .then(({ data }) => setProofUrl(data?.signedUrl ?? null));
  }, [order?.payment_proof_path]);

  async function markShipped() {
    if (!id || !order) return;
    const supabase = createBrowserSupabaseClient();
    await supabase.from("orders").update({ status: "shipped", tracking_number: tracking }).eq("id", id);
    setOrder({ ...order, status: "shipped", tracking_number: tracking });
  }

  async function markPaid() {
    if (!id || !order) return;
    setMarkingPaid(true);
    try {
      const res = await fetch(`/api/admin/orders/${id}/mark-paid`, { method: "POST" });
      if (res.ok) {
        setOrder({ ...order, status: "paid" });
      }
    } finally {
      setMarkingPaid(false);
    }
  }

  if (!order) return null;

  return (
    <main className="px-6 py-6">
      <h1>{order.customer_name} — {order.customer_email}</h1>
      <p>{order.address_line}, {order.city}, {order.country_code}</p>
      <p>Estado: {order.status}</p>
      <p>Metodo de pago: {order.payment_method === "bank_transfer" ? "Deposito bancario" : "PayPal"}</p>
      {proofUrl && <img src={proofUrl} alt="Comprobante de pago" className="mt-2 max-w-xs" />}
      <ul>
        {items.map((i) => (
          <li key={i.id}>{i.quantity} x {i.product_variants?.sku} — ${formatUsd(i.unit_price_cents * i.quantity)}</li>
        ))}
      </ul>
      <p>Total: ${formatUsd(order.total_cents)}</p>
      {order.payment_method === "bank_transfer" && order.status === "pending" && (
        <button onClick={markPaid} disabled={markingPaid}>
          {markingPaid ? "Marcando..." : "Marcar como pagado"}
        </button>
      )}
      <input placeholder="Numero de seguimiento" value={tracking} onChange={(e) => setTracking(e.target.value)} />
      <button onClick={markShipped} disabled={order.status === "pending"}>
        Marcar como enviado
      </button>
    </main>
  );
}
```

- [ ] **Step 2: Run the full test suite and type checker**

Run: `npm test && npx tsc --noEmit`
Expected: everything passes, no type errors.

- [ ] **Step 3: Manual verification**

Requires being signed in at `/admin/login` with an allowlisted admin
account, and a real bank-transfer order to look at (e.g. one created while
manually verifying Task 7 — or place one now).

- Open that order in `/admin/orders/[id]`. Confirm "Metodo de pago:
  Deposito bancario" shows, and the uploaded proof photo renders.
- Click "Marcar como pagado". Confirm the page shows `Estado: paid`
  afterward, and that the "Marcar como pagado" button disappears (only
  shows while `status === "pending"`).
- Confirm the customer's confirmation email arrived (Resend, same as the
  PayPal flow), and that `product_variants.stock` for the purchased variant
  decreased by the ordered quantity (check via the SQL Editor or the
  product's stock in `/admin/products`).
- Open a PayPal order that's still `pending` (if one exists) and confirm
  no "Marcar como pagado" button shows for it.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(protected)/orders/[id]/page.tsx"
git commit -m "feat: review bank-transfer proof and approve payment from the admin"
```

---

## Final verification

After all 10 tasks:

- [ ] `npm test` — full suite green.
- [ ] `npx tsc --noEmit` — no errors.
- [ ] `npm run build` — production build succeeds.
- [ ] Both live-database migrations (Task 1, Task 4) have been run against
  the production Supabase project, not just committed to the repo.
- [ ] A full manual walkthrough on the deployed site
  (celennytops.com) once the branch is merged and redeployed: add an item,
  check out with country `DO`, sector "Distrito Nacional", pay by bank
  transfer with a real photo, see the "en proceso" confirmation, approve it
  from the admin panel, and confirm the customer confirmation email arrives.
