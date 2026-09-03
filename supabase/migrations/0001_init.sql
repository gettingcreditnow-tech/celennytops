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
