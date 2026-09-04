# Envio gratis por cantidad minima - Design Spec

## Overview

Celenny Tops (celennytops.com) wants its first promotional rule: **free shipping when a customer's cart has at least N total items**, N configurable by the shop owner from the admin panel (starting at 2). This is the first piece of a broader "ofertas y cupones" system the user asked for; per-product sale pricing and coupon codes are explicitly out of scope for this spec and will get their own design/plan cycles later.

## Scope Decision

The original request ("sistema de ofertas y cupones") covers at least three independent promotional mechanisms: per-product sale pricing, coupon codes, and quantity-based free shipping. These do not depend on each other, so building all three in one spec/plan would be over-scoped. The user chose to build quantity-based free shipping first. This spec covers only that.

## Requirements (from brainstorming)

- Threshold counts **total item quantity across the cart**, not distinct products (buying 2 units of the same variant qualifies).
- Applies identically to **both payment methods** (PayPal and bank transfer) - no special-casing.
- The threshold must be **admin-editable** from `/admin`, not hardcoded, so the shop owner can change it (e.g. 2 -> 3) without asking for a code change.
- Must be enforced **server-side**, in the same place price and stock are already recomputed from the database (`buildOrderDraft`), so it cannot be spoofed by a tampered client request.

## Architecture

### Data model

New table `store_settings`, a single-row table (mirrors the existing pattern of small typed tables like `shipping_zones` rather than a generic key-value store, since there is exactly one setting today and adding more later means adding columns, not rows):

```sql
create table store_settings (
  id boolean primary key default true,
  free_shipping_min_quantity integer not null default 2,
  constraint store_settings_singleton check (id)
);

insert into store_settings (free_shipping_min_quantity) values (2);
```

The `id boolean primary key default true` + check constraint is a standard Postgres idiom for enforcing "this table can only ever have one row" (a second insert would collide on the primary key). RLS: public read (the checkout flow's create-order routes need it, same trust level as `shipping_zones`, which already has open read), admin-only write (same `is_admin()` policy pattern as every other admin-managed table).

### `buildOrderDraft` (`src/lib/order-draft.ts`)

Gains one new parameter: `freeShippingMinQuantity: number`. After building `lines` (so stock/price validation still happens first and takes priority over any shipping logic), sum `line.quantity` across all lines. If the sum is `>= freeShippingMinQuantity`, the draft's `shippingCents` becomes `0` regardless of the matched zone's `rateCents`, and a new boolean field `freeShippingApplied` is set on the returned `OrderDraft`. The zone itself is still resolved and returned as before (its `rateCents` stays intact on the `zone` object for display purposes - only the draft's own `shippingCents`, the number that becomes the real charge, is zeroed).

### Route changes

`POST /api/paypal/create-order` and `POST /api/bank-transfer/create-order` both already fetch `shipping_zones` before calling `buildOrderDraft`. Each gains one more fetch, `store_settings` (single row, no filter needed), and passes `data.free_shipping_min_quantity` as the new argument. No other change to either route - the anti-fraud shape (validate cart -> recompute from DB -> build order) is unchanged, just fed one more DB-sourced number. This server-side calculation is what actually determines the charged `shipping_cents` - it is authoritative regardless of what the checkout page displayed beforehand.

### `GET /api/shipping-zones`

Gains one more field in its JSON response: `freeShippingMinQuantity` (from the same `store_settings` row). This endpoint is already the checkout page's one fetch for shipping data, so it is the natural place to also hand over the threshold, rather than adding a second endpoint for a single number.

### Checkout UI (`src/app/[locale]/checkout/page.tsx`)

The checkout page does not call `buildOrderDraft` - it independently mirrors the shipping calculation client-side today purely for display (`getShippingZoneForCountry(...)` against the fetched zones list), before the real order is created server-side on submit. This spec extends that existing mirror, it does not introduce a new kind of duplication: the page computes `const totalQuantity = state.items.reduce((sum, i) => sum + i.quantity, 0)` and compares it to the fetched `freeShippingMinQuantity` to decide what to show. The server-side `buildOrderDraft` call (via whichever create-order route the customer's chosen payment method hits) independently makes the same comparison and is what actually determines the charged amount - the client-side version can never be the source of truth, only a preview.

The shipping line changes from:
```
Envio (VIMENPAQ): RD$500
```
to, when the client-side check says the threshold is met:
```
Envio (VIMENPAQ): ~~RD$500~~ RD$0 - Envio gratis por 2+ articulos
```
Rendered as the crossed-out original rate next to the free result, so a customer who is short of the threshold still sees what shipping would normally cost (an incentive to add one more item), and a customer who qualifies sees why it is free rather than a bare unexplained "RD$0". The exact threshold number is interpolated from the fetched setting, not hardcoded in the UI, so admin edits are reflected immediately.

### Admin UI

A new field on the existing shipping-zones admin page (`/admin/shipping-zones`) rather than a whole new settings page - it is a shipping-related setting and that page is already the natural home for shipping business rules, and a brand-new page for a single number would be more surface area than the feature warrants. Adds one labeled number input ("Minimo de articulos para envio gratis") with its own Guardar button, following the same save/error-handling pattern already used by `ShippingZonesForm` and the recently-fixed `ProductForm`.

### Order record

`orders.shipping_cents` already stores whatever `buildOrderDraft` computed, so a free-shipping order correctly shows `shipping_cents: 0` in the database, the admin order-detail page, and the confirmation page/email - no schema change needed there, and no risk of the "real" charged amount ever disagreeing with what is stored (the same invariant every other financial field in this app already holds).

## Out of Scope

- Per-product sale pricing (separate future spec).
- Coupon codes (separate future spec).
- Any promotion stacking rules between this and future discount types (revisit once those exist).
- Displaying a running "add N more for free shipping" progress indicator in the cart before checkout (nice-to-have, not requested).

## Testing

Standard TDD per this project's convention: unit tests for `buildOrderDraft`'s new threshold behavior (below threshold - normal rate charged; at/above threshold - zero charged, flag set; threshold exactly at boundary), and for each route's wiring of the fetched setting into the draft call. No PayPal-specific behavior changes (the capture/verification path already trusts whatever `total_cents` the order row holds, which will already reflect free shipping at creation time).

## Global Constraints (unchanged, restated for the implementer)

- All money as integer USD cents; the storefront's RD$ display is a separate, display-only conversion (`formatDop`) that must never feed back into `shippingCents`/`totalCents`.
- Server always recomputes from the database; the client's cart quantities are the only cart-shaped input trusted from the request, same as today.
- TypeScript strict mode; Vitest tests colocated under `tests/unit/`; every task ends with a commit.
