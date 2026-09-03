-- Restrict admin access to an explicit email allowlist.
--
-- 0001_init.sql granted full admin rights to `auth.role() = 'authenticated'`,
-- which is ANY signed-up Supabase user. Since self-registration is enabled by
-- default and the anon key ships in the client bundle, anyone could register
-- and then read every customer's PII or rewrite prices straight through
-- PostgREST. The allowlist below is enforced in the database policies
-- themselves, so it holds even when PostgREST is called directly.

create table admin_emails (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

alter table admin_emails enable row level security;

-- A signed-in user may check whether their OWN email is on the list (this is
-- what the /admin app gate queries). Nobody can enumerate the other admins.
create policy "read own admin email" on admin_emails
  for select using (lower(email) = lower(auth.jwt() ->> 'email'));

-- security definer: the policies below must be able to consult admin_emails
-- even though RLS on that table only exposes the caller's own row.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admin_emails
    where email = lower(auth.jwt() ->> 'email')
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "authenticated full access products" on products;
create policy "admin full access products" on products
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "authenticated full access variants" on product_variants;
create policy "admin full access variants" on product_variants
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "authenticated full access shipping zones" on shipping_zones;
create policy "admin full access shipping zones" on shipping_zones
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "authenticated read orders" on orders;
create policy "admin read orders" on orders
  for select using (public.is_admin());

drop policy if exists "authenticated update orders" on orders;
create policy "admin update orders" on orders
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "authenticated read order items" on order_items;
create policy "admin read order items" on order_items
  for select using (public.is_admin());

-- Add the store's admin accounts here (lowercase), e.g.:
-- insert into admin_emails (email) values ('owner@example.com');
