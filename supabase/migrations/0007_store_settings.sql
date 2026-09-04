-- Holds store-wide settings the admin can edit from /admin, starting with
-- the minimum cart quantity that earns free shipping. A singleton table
-- (never more than one row) via a boolean primary key: a second insert
-- collides on id=true, so there is exactly one row to read or update.
create table store_settings (
  id boolean primary key default true,
  free_shipping_min_quantity integer not null default 2,
  constraint store_settings_singleton check (id),
  constraint free_shipping_min_quantity_positive check (free_shipping_min_quantity >= 1)
);

insert into store_settings (free_shipping_min_quantity) values (2);

alter table store_settings enable row level security;

create policy "public read store settings" on store_settings
  for select using (true);
create policy "admin update store settings" on store_settings
  for update using (public.is_admin()) with check (public.is_admin());
