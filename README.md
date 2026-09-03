# Celenny Tops

## Local setup

1. `npm install`
2. Copy `.env.local.example` to `.env.local` and fill in:
   - Supabase project URL/keys (Project Settings > API)
   - PayPal sandbox client ID/secret (developer.paypal.com > My Apps & Credentials)
   - Resend API key (resend.com)
3. Run the SQL in `supabase/migrations/` **in filename order**
   (`0001_init.sql`, `0002_admin_allowlist.sql`, `0003_storage_policies.sql`),
   then `supabase/seed.sql`, against your Supabase project (SQL Editor).
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
