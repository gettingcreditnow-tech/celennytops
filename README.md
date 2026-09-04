# Celenny Tops

## Local setup

1. `npm install`
2. Copy `.env.local.example` to `.env.local` and fill in:
   - Supabase project URL/keys (Project Settings > API)
   - PayPal sandbox client ID/secret (developer.paypal.com > My Apps & Credentials)
   - Resend API key (resend.com)
   - `ORDER_NOTIFICATION_EMAIL` — the shop inbox that receives the "new order"
     and "payment needs review" notifications sent from
     `src/lib/email.ts`. Customer confirmations go to the buyer instead.
3. Run the SQL in `supabase/migrations/` **in filename order**
   (`0001_init.sql`, `0002_admin_allowlist.sql`, `0003_storage_policies.sql`,
   `0004_santo_domingo_shipping.sql`, `0005_bank_transfer_payments.sql`,
   `0006_remove_latinoamerica_zone.sql`),
   then `supabase/seed.sql`, against your Supabase project (SQL Editor).
   `0005` also creates the private `payment-proofs` Storage bucket itself
   (via SQL) — unlike `product-images` below, no manual bucket creation is
   needed for it.
4. Create a public Storage bucket named `product-images`. "Public" only grants
   public *read*; `0003_storage_policies.sql` adds the write policies the admin
   panel's image upload needs, so run it after the bucket exists.
5. Create the 2 admin users under Authentication > Users, then allowlist them by
   running this in the SQL Editor (lowercase emails, one row each):

   ```sql
   insert into admin_emails (email) values
     ('primer-admin@example.com'),
     ('segundo-admin@example.com');
   ```

   Being a signed-up Supabase user is **not** enough — every admin RLS policy
   and the `/admin` app gate check this table, so an account that is not listed
   here gets no admin access at all.
6. Verify the sending domain in Resend. `src/lib/email.ts` sends every message
   `from: "Celenny tops <orders@celennytops.com>"`, and Resend rejects any send
   from a domain that is not verified on the account — add `celennytops.com`
   under Resend > Domains and publish the DNS records it gives you, or change
   that `from` address to a domain you have verified. Until then no order email
   goes out (the send failure is caught and logged server-side, so the checkout
   itself still succeeds).
7. `npm run dev`

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Add the same environment variables from `.env.local` in Vercel's
   Project Settings > Environment Variables — use PayPal **live**
   credentials and `PAYPAL_API_BASE=https://api-m.paypal.com` for
   production.
4. Deploy.

## Testing

`npm test` runs the unit test suite (pricing, shipping zones, cart, cart page,
PayPal order building, server-side order pricing/stock checks, capture-order's
amount verification and status transitions, email content, middleware routing).
