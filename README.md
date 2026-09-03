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
