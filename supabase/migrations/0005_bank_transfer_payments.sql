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
