# Envio gratis por cantidad minima - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Free shipping automatically applies when a customer's cart holds at least N total items (N admin-editable, default 2), enforced server-side so it cannot be spoofed, and shown clearly in the checkout UI.

**Architecture:** A new singleton `store_settings` table holds the one configurable number. `buildOrderDraft` (the single choke point both payment routes already use to recompute price/stock from the database) gains a threshold parameter and zeroes `shippingCents` when the cart's total quantity meets it. The checkout page independently mirrors the same comparison client-side, purely for display, exactly like it already mirrors shipping-zone rates today - the server-side call is what actually determines the charge.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), Vitest.

## Global Constraints

- All money as integer USD cents internally. The storefront's RD$ display (`formatDop`) is a separate, display-only conversion and must never feed into `shippingCents`/`totalCents`.
- The server always recomputes from the database; a client's cart quantities are the only client-supplied cart-shaped input ever trusted (established anti-fraud pattern - see `buildOrderDraft`).
- TypeScript strict mode.
- Vitest tests colocated under `tests/unit/`.
- Every task ends with a commit.
- This is a live production store (celennytops.com). The migration in Task 1 must be run against the real Supabase project by the human after that task is implemented and reviewed - do not treat "committed to the repo" as "applied."

---

### Task 1: `store_settings` table and RLS

**Files:**
- Create: `supabase/migrations/0007_store_settings.sql`
- Modify: `README.md`

**Interfaces:**
- Produces: a table `store_settings` with exactly one row (id `true`), column `free_shipping_min_quantity integer not null default 2`. Public read, admin-only write (mirrors `shipping_zones`'s RLS shape).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0007_store_settings.sql`:

```sql
-- Holds store-wide settings the admin can edit from /admin, starting with
-- the minimum cart quantity that earns free shipping. A singleton table
-- (never more than one row) via a boolean primary key: a second insert
-- collides on id=true, so there is exactly one row to read or update.
create table store_settings (
  id boolean primary key default true,
  free_shipping_min_quantity integer not null default 2,
  constraint store_settings_singleton check (id)
);

insert into store_settings (free_shipping_min_quantity) values (2);

alter table store_settings enable row level security;

create policy "public read store settings" on store_settings
  for select using (true);
create policy "admin update store settings" on store_settings
  for update using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 2: Update the README's migration list**

In `README.md`, find this block:

```
3. Run the SQL in `supabase/migrations/` **in filename order**
   (`0001_init.sql`, `0002_admin_allowlist.sql`, `0003_storage_policies.sql`,
   `0004_santo_domingo_shipping.sql`, `0005_bank_transfer_payments.sql`,
   `0006_remove_latinoamerica_zone.sql`),
   then `supabase/seed.sql`, against your Supabase project (SQL Editor).
```

Replace it with:

```
3. Run the SQL in `supabase/migrations/` **in filename order**
   (`0001_init.sql`, `0002_admin_allowlist.sql`, `0003_storage_policies.sql`,
   `0004_santo_domingo_shipping.sql`, `0005_bank_transfer_payments.sql`,
   `0006_remove_latinoamerica_zone.sql`, `0007_store_settings.sql`),
   then `supabase/seed.sql`, against your Supabase project (SQL Editor).
```

(If the exact current wording in the file differs slightly from what's quoted above, match the real file - the point is appending `0007_store_settings.sql` to that parenthetical list.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0007_store_settings.sql README.md
git commit -m "feat: add store_settings table for the free-shipping threshold"
```

- [ ] **Step 4: Run against production (controller + human, immediately after this task's review)**

Paste the contents of `supabase/migrations/0007_store_settings.sql` into the Supabase SQL Editor for the live project and run it. Verify via `curl` against `GET /api/shipping-zones` after Task 4 lands (that endpoint will start including `freeShippingMinQuantity` once Task 4 is done) - not required to verify before moving to Task 2, since Tasks 2-5 do not need the live table to be implemented and unit-tested, only to be *live-verified* at the end.

---

### Task 2: `buildOrderDraft` free-shipping threshold

**Files:**
- Modify: `src/lib/order-draft.ts`
- Test: `tests/unit/order-draft.test.ts`

**Interfaces:**
- Consumes: nothing new (pure function, no DB access).
- Produces: `buildOrderDraft(items, variants, zones, countryCode, sector?, freeShippingMinQuantity?)` - the new 6th parameter is optional and defaults to `Infinity` (meaning "never applies"), so every existing call site and test that omits it keeps its current behavior unchanged. `OrderDraft` gains `freeShippingApplied: boolean`. When the cart's total quantity (summed across `lines`) is `>= freeShippingMinQuantity`, `shippingCents` is `0` and `freeShippingApplied` is `true`; the resolved `zone.rateCents` is left untouched (Task 4's checkout UI needs the original rate to show crossed out).

- [ ] **Step 1: Write the failing tests**

Add this new `describe` block to `tests/unit/order-draft.test.ts` (place it after the existing `describe("buildOrderDraft with Santo Domingo sectors", ...)` block, before `describe("findReusablePendingOrder", ...)`):

```ts
describe("buildOrderDraft free shipping by quantity", () => {
  const localVariants: VariantPricingRow[] = [
    { id: "v1", price_cents: 2500, stock: 5 },
    { id: "v2", price_cents: 1000, stock: 5 },
  ];
  const localZones: ShippingZoneRow[] = [
    { id: "z1", name: "Pais local", country_codes: ["CO"], sector: null, rate_cents: 500 },
  ];

  it("charges the normal rate when total quantity is below the threshold", () => {
    const result = buildOrderDraft([{ variantId: "v1", quantity: 1 }], localVariants, localZones, "CO", undefined, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.shippingCents).toBe(500);
    expect(result.draft.freeShippingApplied).toBe(false);
  });

  it("zeroes shipping once a single line's quantity meets the threshold", () => {
    const result = buildOrderDraft([{ variantId: "v1", quantity: 2 }], localVariants, localZones, "CO", undefined, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.shippingCents).toBe(0);
    expect(result.draft.totalCents).toBe(result.draft.subtotalCents);
    expect(result.draft.freeShippingApplied).toBe(true);
    expect(result.draft.zone.rateCents).toBe(500);
  });

  it("sums quantity across multiple lines toward the threshold", () => {
    const result = buildOrderDraft(
      [
        { variantId: "v1", quantity: 1 },
        { variantId: "v2", quantity: 1 },
      ],
      localVariants,
      localZones,
      "CO",
      undefined,
      2
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.freeShippingApplied).toBe(true);
    expect(result.draft.shippingCents).toBe(0);
  });

  it("defaults to no free-shipping threshold when the parameter is omitted", () => {
    const result = buildOrderDraft([{ variantId: "v1", quantity: 5 }], localVariants, localZones, "CO");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.shippingCents).toBe(500);
    expect(result.draft.freeShippingApplied).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run order-draft.test.ts`
Expected: FAIL - `result.draft.freeShippingApplied` is `undefined`, not `false`/`true` (the field does not exist yet), and the 6-argument call is a TS error until the signature changes.

- [ ] **Step 3: Implement**

In `src/lib/order-draft.ts`, change the `OrderDraft` type:

```ts
export type OrderDraft = {
  lines: OrderDraftLine[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  zone: ShippingZone;
  freeShippingApplied: boolean;
};
```

Change the `buildOrderDraft` function signature and its body from this point on (everything above the `zone` lookup is unchanged):

```ts
export function buildOrderDraft(
  items: CartItemInput[],
  variants: VariantPricingRow[],
  zones: ShippingZoneRow[],
  countryCode: string,
  sector?: string,
  freeShippingMinQuantity: number = Infinity
): OrderDraftResult {
  const lines: OrderDraftLine[] = [];

  for (const item of items) {
    const variant = variants.find((v) => v.id === item.variantId);
    // Unknown id: stale cart, deleted variant, or a tampered payload.
    if (!variant) return { ok: false, status: 400, body: { error: "invalid_items" } };
    if (item.quantity > variant.stock) {
      return {
        ok: false,
        status: 409,
        body: {
          error: "insufficient_stock",
          variantId: variant.id,
          requested: item.quantity,
          available: variant.stock,
        },
      };
    }
    lines.push({
      variantId: item.variantId,
      quantity: item.quantity,
      unitPriceCents: variant.price_cents,
    });
  }

  const zone = getShippingZoneForCountry(countryCode, zones.map(toShippingZone), sector);
  if (!zone) return { ok: false, status: 400, body: { error: "no_shipping_zone" } };

  const subtotalCents = computeSubtotalCents(lines);
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const freeShippingApplied = totalQuantity >= freeShippingMinQuantity;
  const shippingCents = freeShippingApplied ? 0 : zone.rateCents;
  return {
    ok: true,
    draft: {
      lines,
      subtotalCents,
      shippingCents,
      totalCents: computeTotalCents(subtotalCents, shippingCents),
      zone,
      freeShippingApplied,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run order-draft.test.ts`
Expected: PASS, all tests including the 4 new ones.

- [ ] **Step 5: Run the full suite and type checker**

Run: `npx vitest run --exclude "**/node_modules/**" && npx tsc --noEmit`
Expected: everything passes, no type errors. (The `--exclude` flag works around an unrelated environment quirk on this machine where Vitest's default discovery can pick up a stray nested directory - harmless, already the established way to run the suite here.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/order-draft.ts tests/unit/order-draft.test.ts
git commit -m "feat: buildOrderDraft zeroes shipping once cart quantity meets a threshold"
```

---

### Task 3: Wire the threshold into both create-order routes

**Files:**
- Modify: `src/app/api/paypal/create-order/route.ts`
- Modify: `src/app/api/bank-transfer/create-order/route.ts`
- Test: `tests/unit/paypal-create-order.test.ts` (new - this route currently has no dedicated test file)
- Test: `tests/unit/bank-transfer-create-order.test.ts` (modify - add a `store_settings` stub branch and one new test)

**Interfaces:**
- Consumes: `buildOrderDraft`'s new 6th parameter (Task 2).
- Produces: nothing new for later tasks - this task is a leaf.

- [ ] **Step 1: Modify the PayPal create-order route**

In `src/app/api/paypal/create-order/route.ts`, this block:

```ts
  const { data: zones, error: zonesError } = await supabase.from("shipping_zones").select("*");
  if (zonesError || !zones) {
    return NextResponse.json({ error: "no_shipping_zone" }, { status: 400 });
  }

  // Prices, stock and shipping are all recomputed from the database rows here;
  // nothing the client sent besides variant ids and quantities is trusted.
  const draftResult = buildOrderDraft(cartItems, variants, zones, customer.countryCode, customer.city);
```

becomes:

```ts
  const { data: zones, error: zonesError } = await supabase.from("shipping_zones").select("*");
  if (zonesError || !zones) {
    return NextResponse.json({ error: "no_shipping_zone" }, { status: 400 });
  }

  const { data: settings } = await supabase
    .from("store_settings")
    .select("free_shipping_min_quantity")
    .maybeSingle();
  const freeShippingMinQuantity = settings?.free_shipping_min_quantity ?? Infinity;

  // Prices, stock and shipping are all recomputed from the database rows here;
  // nothing the client sent besides variant ids and quantities is trusted.
  const draftResult = buildOrderDraft(
    cartItems,
    variants,
    zones,
    customer.countryCode,
    customer.city,
    freeShippingMinQuantity
  );
```

- [ ] **Step 2: Modify the bank-transfer create-order route**

In `src/app/api/bank-transfer/create-order/route.ts`, this block:

```ts
  const { data: zones, error: zonesError } = await supabase.from("shipping_zones").select("*");
  if (zonesError || !zones) {
    return NextResponse.json({ error: "no_shipping_zone" }, { status: 400 });
  }

  const draftResult = buildOrderDraft(cartItems, variants, zones, customer.countryCode, customer.city);
```

becomes:

```ts
  const { data: zones, error: zonesError } = await supabase.from("shipping_zones").select("*");
  if (zonesError || !zones) {
    return NextResponse.json({ error: "no_shipping_zone" }, { status: 400 });
  }

  const { data: settings } = await supabase
    .from("store_settings")
    .select("free_shipping_min_quantity")
    .maybeSingle();
  const freeShippingMinQuantity = settings?.free_shipping_min_quantity ?? Infinity;

  const draftResult = buildOrderDraft(
    cartItems,
    variants,
    zones,
    customer.countryCode,
    customer.city,
    freeShippingMinQuantity
  );
```

- [ ] **Step 3: Add a `store_settings` stub to the bank-transfer test file, plus one new test**

In `tests/unit/bank-transfer-create-order.test.ts`, the `createSupabaseStub` function's options type and `from(table)` body need one more branch. Find:

```ts
function createSupabaseStub(opts: {
  variants: Result;
  zones: Result;
  upload?: { error: unknown };
  orderInsert?: Result;
  itemsInsert?: { error: unknown };
  duplicates?: Result;
}) {
```

Change the opts type to add `settings?: Result;`:

```ts
function createSupabaseStub(opts: {
  variants: Result;
  zones: Result;
  settings?: Result;
  upload?: { error: unknown };
  orderInsert?: Result;
  itemsInsert?: { error: unknown };
  duplicates?: Result;
}) {
```

Inside that function's `from(table)` body, find:

```ts
      if (table === "shipping_zones") {
        return { select: async () => opts.zones };
      }
```

Add a new branch immediately after it:

```ts
      if (table === "shipping_zones") {
        return { select: async () => opts.zones };
      }
      if (table === "store_settings") {
        return {
          select: () => ({
            maybeSingle: async () => opts.settings ?? { data: { free_shipping_min_quantity: 2 }, error: null },
          }),
        };
      }
```

Then add this new test case inside the `describe("POST /api/bank-transfer/create-order", ...)` block (any position after the existing tests is fine):

```ts
  it("zeroes shipping once the cart quantity meets the free-shipping threshold", async () => {
    const stub = createSupabaseStub({
      variants: { data: variants, error: null },
      zones: { data: zones, error: null },
      orderInsert: { data: { id: "order-free-ship", customer_name: "Ana", total_cents: 5000 }, error: null },
    });
    createAdminSupabaseClient.mockReturnValue(stub.client);

    const res = await post(buildForm({ items: [{ variantId: "v1", quantity: 2 }] }));

    expect(res.status).toBe(200);
    const orderInsert = stub.inserts.find((i) => i.table === "orders");
    expect(orderInsert?.payload).toMatchObject({ shipping_cents: 0, total_cents: 5000 });
  });
```

(This uses the file's existing top-level `variants` fixture - `[{ id: "v1", price_cents: 2500, stock: 3 }]` - and `zones` fixture - the Distrito Nacional zone at `rate_cents: 500` - so quantity 2 gives subtotal 5000, and with the default threshold of 2 from the new stub branch, shipping is zeroed: total 5000. If those fixtures differ from what's quoted here when you open the file, adjust the expected numbers to match subtotal = `price_cents * 2`, total = subtotal, since shipping is 0.)

- [ ] **Step 4: Create the new PayPal create-order test file**

Create `tests/unit/paypal-create-order.test.ts`. This route currently has no dedicated test file (only the lower-level `createPayPalOrder` PayPal API client and the downstream capture-order route are tested elsewhere) - this test covers exactly the free-shipping wiring this task adds, not full route coverage:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { createAdminSupabaseClient, createPayPalOrder } = vi.hoisted(() => ({
  createAdminSupabaseClient: vi.fn(),
  createPayPalOrder: vi.fn(async () => ({ id: "pp-order-1" })),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient }));
vi.mock("@/lib/paypal", () => ({ createPayPalOrder }));

import { POST } from "@/app/api/paypal/create-order/route";

type Result = { data: unknown; error: unknown };

const variants = [{ id: "v1", price_cents: 1200, stock: 5 }];
const zones = [{ id: "z1", name: "Pais local", country_codes: ["CO"], sector: null, rate_cents: 500 }];

function createSupabaseStub(opts: {
  settings?: Result;
  candidates?: Result;
  orderInsert?: Result;
  itemsInsert?: { error: unknown };
}) {
  const inserts: { table: string; payload: unknown }[] = [];
  const client = {
    from(table: string) {
      if (table === "product_variants") {
        return { select: () => ({ in: async () => ({ data: variants, error: null }) }) };
      }
      if (table === "shipping_zones") {
        return { select: async () => ({ data: zones, error: null }) };
      }
      if (table === "store_settings") {
        return {
          select: () => ({
            maybeSingle: async () => opts.settings ?? { data: { free_shipping_min_quantity: 2 }, error: null },
          }),
        };
      }
      if (table === "orders") {
        const reuseChain: {
          eq: () => typeof reuseChain;
          gte: () => typeof reuseChain;
          order: () => typeof reuseChain;
          limit: () => Promise<Result>;
        } = {
          eq: () => reuseChain,
          gte: () => reuseChain,
          order: () => reuseChain,
          limit: async () => opts.candidates ?? { data: [], error: null },
        };
        return {
          select: () => reuseChain,
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
  };
  return { client, inserts };
}

function post(body: unknown) {
  return POST({ json: async () => body } as NextRequest);
}

const customer = { name: "Ana", email: "ana@example.com", address: "Calle 1", city: "Bogota", countryCode: "CO" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/paypal/create-order free shipping", () => {
  it("charges the normal shipping rate when cart quantity is below the threshold", async () => {
    const stub = createSupabaseStub({ orderInsert: { data: { id: "order-1" }, error: null } });
    createAdminSupabaseClient.mockReturnValue(stub.client);

    const res = await post({ items: [{ variantId: "v1", quantity: 1 }], customer, locale: "es" });

    expect(res.status).toBe(200);
    expect(createPayPalOrder).toHaveBeenCalledWith(1700, "USD");
    const orderInsert = stub.inserts.find((i) => i.table === "orders");
    expect(orderInsert?.payload).toMatchObject({ shipping_cents: 500, total_cents: 1700 });
  });

  it("zeroes shipping and charges PayPal only the subtotal once quantity meets the threshold", async () => {
    const stub = createSupabaseStub({ orderInsert: { data: { id: "order-2" }, error: null } });
    createAdminSupabaseClient.mockReturnValue(stub.client);

    const res = await post({ items: [{ variantId: "v1", quantity: 2 }], customer, locale: "es" });

    expect(res.status).toBe(200);
    expect(createPayPalOrder).toHaveBeenCalledWith(2400, "USD");
    const orderInsert = stub.inserts.find((i) => i.table === "orders");
    expect(orderInsert?.payload).toMatchObject({ shipping_cents: 0, total_cents: 2400 });
  });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run paypal-create-order.test.ts bank-transfer-create-order.test.ts`
Expected: PASS, including all pre-existing bank-transfer tests (they omit `settings`, so the new stub branch defaults to threshold 2, and every existing test's cart quantity is 1, so their behavior and assertions are unaffected).

- [ ] **Step 6: Run the full suite and type checker**

Run: `npx vitest run --exclude "**/node_modules/**" && npx tsc --noEmit`
Expected: everything passes, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/paypal/create-order/route.ts src/app/api/bank-transfer/create-order/route.ts tests/unit/paypal-create-order.test.ts tests/unit/bank-transfer-create-order.test.ts
git commit -m "feat: apply the free-shipping threshold in both create-order routes"
```

---

### Task 4: `GET /api/shipping-zones` response shape and checkout UI

**Files:**
- Modify: `src/app/api/shipping-zones/route.ts`
- Modify: `src/app/[locale]/checkout/page.tsx`
- Modify: `messages/es.json`
- Modify: `messages/en.json`
- Test: `tests/unit/shipping-zones-route.test.ts` (new)

**Interfaces:**
- Produces: `GET /api/shipping-zones` now returns `{ zones: ShippingZone[], freeShippingMinQuantity: number | null }` instead of a bare array. This is a breaking response-shape change, so the route and its one consumer (the checkout page) must land in the same commit - do not split this into two tasks, a deploy in between would break checkout's shipping display (not the actual charge, which stays correct via Task 3, but the displayed number would be wrong).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/shipping-zones-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

import { GET } from "@/app/api/shipping-zones/route";

const zoneRow = {
  id: "z1",
  name: "Distrito Nacional",
  country_codes: ["DO"],
  sector: "Distrito Nacional",
  rate_cents: 500,
};

function createSupabaseStub(opts: {
  zones?: { data: unknown; error: unknown };
  settings?: { data: unknown; error: unknown };
}) {
  return {
    from(table: string) {
      if (table === "shipping_zones") {
        return { select: async () => opts.zones ?? { data: [zoneRow], error: null } };
      }
      if (table === "store_settings") {
        return {
          select: () => ({
            maybeSingle: async () => opts.settings ?? { data: { free_shipping_min_quantity: 2 }, error: null },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/shipping-zones", () => {
  it("returns the mapped zones alongside the free-shipping threshold", async () => {
    createServerSupabaseClient.mockResolvedValue(createSupabaseStub({}));

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      zones: [{ id: "z1", name: "Distrito Nacional", countryCodes: ["DO"], sector: "Distrito Nacional", rateCents: 500 }],
      freeShippingMinQuantity: 2,
    });
  });

  it("returns null for the threshold when the settings row is missing", async () => {
    createServerSupabaseClient.mockResolvedValue(createSupabaseStub({ settings: { data: null, error: null } }));

    const res = await GET();

    expect((await res.json()).freeShippingMinQuantity).toBeNull();
  });

  it("500s when the zones query fails", async () => {
    createServerSupabaseClient.mockResolvedValue(
      createSupabaseStub({ zones: { data: null, error: { message: "boom" } } })
    );

    const res = await GET();

    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run shipping-zones-route.test.ts`
Expected: FAIL - the current route returns a bare array, not `{ zones, freeShippingMinQuantity }`.

- [ ] **Step 3: Implement the route change**

Replace `src/app/api/shipping-zones/route.ts` entirely with:

```ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase.from("shipping_zones").select("*"),
    supabase.from("store_settings").select("free_shipping_min_quantity").maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    zones: (data ?? []).map((z) => ({
      id: z.id,
      name: z.name,
      countryCodes: z.country_codes,
      sector: z.sector,
      rateCents: z.rate_cents,
    })),
    freeShippingMinQuantity: settings?.free_shipping_min_quantity ?? null,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run shipping-zones-route.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Add the translation keys**

In `messages/es.json`, this line:

```
  "checkout": { "title": "Finalizar compra", "name": "Nombre completo", "email": "Correo electronico", "address": "Direccion", "city": "Ciudad", "country": "Pais", "shipping": "Envio", "total": "Total", "pay": "Pagar con PayPal", "bankTransfer": { "title": "Deposito bancario", "holder": "Titular", "holderId": "Cedula", "instructions": "Por favor, enviame el comprobante de pago.", "submit": "Enviar comprobante y confirmar pedido", "error": "No pudimos enviar tu comprobante. Intenta de nuevo.", "tooLarge": "El archivo es demasiado grande (maximo 4 MB)." } },
```

becomes (added `"freeShipping"` right after `"pay"`):

```
  "checkout": { "title": "Finalizar compra", "name": "Nombre completo", "email": "Correo electronico", "address": "Direccion", "city": "Ciudad", "country": "Pais", "shipping": "Envio", "total": "Total", "pay": "Pagar con PayPal", "freeShipping": "Envio gratis por {count}+ articulos", "bankTransfer": { "title": "Deposito bancario", "holder": "Titular", "holderId": "Cedula", "instructions": "Por favor, enviame el comprobante de pago.", "submit": "Enviar comprobante y confirmar pedido", "error": "No pudimos enviar tu comprobante. Intenta de nuevo.", "tooLarge": "El archivo es demasiado grande (maximo 4 MB)." } },
```

In `messages/en.json`, this line:

```
  "checkout": { "title": "Checkout", "name": "Full name", "email": "Email", "address": "Address", "city": "City", "country": "Country", "shipping": "Shipping", "total": "Total", "pay": "Pay with PayPal", "bankTransfer": { "title": "Bank transfer", "holder": "Account holder", "holderId": "ID number", "instructions": "Please send me your payment proof.", "submit": "Send proof and confirm order", "error": "We could not send your proof. Please try again.", "tooLarge": "The file is too large (max 4 MB)." } },
```

becomes:

```
  "checkout": { "title": "Checkout", "name": "Full name", "email": "Email", "address": "Address", "city": "City", "country": "Country", "shipping": "Shipping", "total": "Total", "pay": "Pay with PayPal", "freeShipping": "Free shipping on {count}+ items", "bankTransfer": { "title": "Bank transfer", "holder": "Account holder", "holderId": "ID number", "instructions": "Please send me your payment proof.", "submit": "Send proof and confirm order", "error": "We could not send your proof. Please try again.", "tooLarge": "The file is too large (max 4 MB)." } },
```

(If the real files differ slightly from these quoted lines by the time you edit them, match the actual current line - the point is inserting `"freeShipping"` with that exact value, right after `"pay"`, in each file's `checkout` object.)

- [ ] **Step 6: Update the checkout page**

In `src/app/[locale]/checkout/page.tsx`, this block:

```tsx
  const [zones, setZones] = useState<ShippingZone[]>([]);
  // Only Dominican Republic (Santo Domingo sectors) ships for now - see
  // the shipping/bank-transfer plan. countryCode is fixed rather than a
  // free-text field so a customer can't select a destination we don't
  // actually serve.
  const [form, setForm] = useState({
    name: "",
    email: "",
    address: "",
    city: "",
    countryCode: "DO",
  });

  useEffect(() => {
    fetch("/api/shipping-zones")
      .then((r) => r.json())
      .then(setZones);
  }, []);

  const subtotal = computeSubtotalCents(state.items);
  const zone = getShippingZoneForCountry(form.countryCode, zones, form.city || undefined);
  const shipping = zone?.rateCents ?? 0;
  const total = computeTotalCents(subtotal, shipping);
  const doSectors = zones.filter((z) => z.countryCodes.includes("DO") && z.sector);
```

becomes:

```tsx
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [freeShippingMinQuantity, setFreeShippingMinQuantity] = useState<number | null>(null);
  // Only Dominican Republic (Santo Domingo sectors) ships for now - see
  // the shipping/bank-transfer plan. countryCode is fixed rather than a
  // free-text field so a customer can't select a destination we don't
  // actually serve.
  const [form, setForm] = useState({
    name: "",
    email: "",
    address: "",
    city: "",
    countryCode: "DO",
  });

  useEffect(() => {
    fetch("/api/shipping-zones")
      .then((r) => r.json())
      .then((data) => {
        setZones(data.zones);
        setFreeShippingMinQuantity(data.freeShippingMinQuantity);
      });
  }, []);

  const subtotal = computeSubtotalCents(state.items);
  const zone = getShippingZoneForCountry(form.countryCode, zones, form.city || undefined);
  const totalQuantity = state.items.reduce((sum, item) => sum + item.quantity, 0);
  // This is a display-only mirror of the same comparison buildOrderDraft makes
  // server-side (see order-draft.ts) - it decides what the customer sees before
  // submitting, never what gets charged. The create-order routes independently
  // recompute this from the database when the order is actually created.
  const freeShippingApplied = freeShippingMinQuantity !== null && totalQuantity >= freeShippingMinQuantity;
  const shipping = freeShippingApplied ? 0 : zone?.rateCents ?? 0;
  const total = computeTotalCents(subtotal, shipping);
  const doSectors = zones.filter((z) => z.countryCodes.includes("DO") && z.sector);
```

Then this block:

```tsx
      <div className="mt-6">
        <p>
          {t("shipping")}
          {zone?.sector ? " (VIMENPAQ)" : ""}: RD${formatDop(shipping)}
        </p>
        <p>{t("total")}: RD${formatDop(total)}</p>
      </div>
```

becomes:

```tsx
      <div className="mt-6">
        {freeShippingApplied ? (
          <p>
            {t("shipping")}
            {zone?.sector ? " (VIMENPAQ)" : ""}:{" "}
            <span className="line-through opacity-60">RD${formatDop(zone?.rateCents ?? 0)}</span> RD$0 —{" "}
            {t("freeShipping", { count: freeShippingMinQuantity ?? 0 })}
          </p>
        ) : (
          <p>
            {t("shipping")}
            {zone?.sector ? " (VIMENPAQ)" : ""}: RD${formatDop(shipping)}
          </p>
        )}
        <p>{t("total")}: RD${formatDop(total)}</p>
      </div>
```

- [ ] **Step 7: Run the full suite and type checker**

Run: `npx vitest run --exclude "**/node_modules/**" && npx tsc --noEmit`
Expected: everything passes, no type errors.

- [ ] **Step 8: Manual verification**

Run `npm run dev`, add 1 item to the cart, go to `/es/checkout`, pick a DO sector - confirm the shipping line shows the normal rate. Add a 2nd item (or increase quantity to 2) - confirm the line switches to a crossed-out original rate plus "RD$0 — Envio gratis por 2+ articulos", and the total drops accordingly.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/shipping-zones/route.ts "src/app/[locale]/checkout/page.tsx" messages/es.json messages/en.json tests/unit/shipping-zones-route.test.ts
git commit -m "feat: show free shipping in the checkout UI"
```

---

### Task 5: Admin UI for the threshold

**Files:**
- Modify: `src/app/admin/(protected)/shipping-zones/page.tsx`
- Modify: `src/components/admin/ShippingZonesForm.tsx`

**Interfaces:**
- Consumes: `store_settings` (Task 1).
- Produces: nothing later tasks depend on - this plan's final task.

- [ ] **Step 1: Update the admin shipping-zones page to load the setting**

Replace `src/app/admin/(protected)/shipping-zones/page.tsx` entirely with:

```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ShippingZonesForm } from "@/components/admin/ShippingZonesForm";

export default async function AdminShippingZonesPage() {
  const supabase = await createServerSupabaseClient();
  const [{ data }, { data: settings }] = await Promise.all([
    supabase.from("shipping_zones").select("*").order("sort_order"),
    supabase.from("store_settings").select("free_shipping_min_quantity").maybeSingle(),
  ]);
  const zones = (data ?? []).map((z) => ({
    id: z.id,
    name: z.name,
    countryCodes: z.country_codes,
    sector: z.sector,
    rateCents: z.rate_cents,
  }));
  return (
    <ShippingZonesForm
      initialZones={zones}
      initialFreeShippingMinQuantity={settings?.free_shipping_min_quantity ?? 2}
    />
  );
}
```

- [ ] **Step 2: Add the editable field to the form**

Replace `src/components/admin/ShippingZonesForm.tsx` entirely with:

```tsx
"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { ShippingZone } from "@/lib/types";

export function ShippingZonesForm({
  initialZones,
  initialFreeShippingMinQuantity,
}: {
  initialZones: ShippingZone[];
  initialFreeShippingMinQuantity: number;
}) {
  const [zones, setZones] = useState(initialZones);
  const [freeShippingMinQuantity, setFreeShippingMinQuantity] = useState(initialFreeShippingMinQuantity);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [thresholdError, setThresholdError] = useState<string | null>(null);

  async function saveZone(zone: ShippingZone) {
    const supabase = createBrowserSupabaseClient();
    await supabase
      .from("shipping_zones")
      .update({ name: zone.name, country_codes: zone.countryCodes, rate_cents: zone.rateCents })
      .eq("id", zone.id);
  }

  async function saveFreeShippingThreshold() {
    setThresholdError(null);
    setSavingThreshold(true);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase
      .from("store_settings")
      .update({ free_shipping_min_quantity: freeShippingMinQuantity })
      .eq("id", true);
    if (error) {
      setThresholdError(`No se pudo guardar: ${error.message}`);
    }
    setSavingThreshold(false);
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

      <div className="mt-4 flex items-center gap-2 border-t pt-4">
        <label>
          Minimo de articulos para envio gratis{" "}
          <input
            type="number"
            min={1}
            value={freeShippingMinQuantity}
            onChange={(e) => setFreeShippingMinQuantity(Number(e.target.value))}
          />
        </label>
        <button onClick={saveFreeShippingThreshold} disabled={savingThreshold}>
          {savingThreshold ? "Guardando..." : "Guardar"}
        </button>
      </div>
      {thresholdError && <p role="alert" className="text-red-600">{thresholdError}</p>}
    </div>
  );
}
```

Note: this project's admin CRUD forms (`ShippingZonesForm`'s existing zone rows, `ProductForm`) are not unit-tested - they're thin Supabase-write wrappers verified live/manually, and this field follows that same established pattern. Do not add a new test file for this component; rely on Step 4 below plus `tsc`.

- [ ] **Step 3: Run the type checker**

Run: `npx tsc --noEmit`
Expected: no type errors. (No new tests in this task - see the note in Step 2.)

- [ ] **Step 4: Manual verification**

Sign in at `/admin/login`, open `/admin/shipping-zones`, confirm the new "Minimo de articulos para envio gratis" field shows `2` (or whatever the live `store_settings` row currently holds), change it to `3`, click its Guardar, refresh the page, confirm it now shows `3`. Then go to `/es/checkout` with a cart of exactly 2 items and confirm free shipping no longer applies (since the live threshold is now 3) - change it back to `2` afterward so the store's actual promotion matches what was designed with the user.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(protected)/shipping-zones/page.tsx" src/components/admin/ShippingZonesForm.tsx
git commit -m "feat: make the free-shipping threshold editable from the admin panel"
```

---

## Final Verification

After all 5 tasks:

- [ ] `npx vitest run --exclude "**/node_modules/**"` — full suite green.
- [ ] `npx tsc --noEmit` — no errors.
- [ ] `npm run build` — production build succeeds.
- [ ] `supabase/migrations/0007_store_settings.sql` has been run against the live production Supabase project (Task 1, Step 4), not just committed to the repo.
- [ ] A full manual walkthrough on the deployed site (celennytops.com): add 1 item, confirm normal shipping shows; add a 2nd, confirm the crossed-out rate + "Envio gratis" message appears and the total drops; complete a real (or bank-transfer test) checkout and confirm the resulting order's `shipping_cents` is actually `0` in `/admin/orders/[id]`, not just displayed as 0 - the display and the charge must agree.
