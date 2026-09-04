-- Splits the placeholder "Pais local" (CO) zone into 4 priced Santo Domingo
-- sectors. The business operates from Dominican Republic, not Colombia -
-- CO was a seed placeholder from before the real shipping data existed.
--
-- The old CO row is UPDATEd in place (not deleted + reinserted) because live
-- orders already reference its id via orders.shipping_zone_id - deleting it
-- would violate that foreign key. Repurposing it as "Distrito Nacional"
-- keeps those existing orders pointing at a valid, correctly-named zone.
alter table shipping_zones add column sector text;

update shipping_zones
set name = 'Distrito Nacional',
    country_codes = array['DO'],
    sector = 'Distrito Nacional',
    rate_cents = 500,
    sort_order = 2
where name = 'Pais local' and country_codes = array['CO'];

insert into shipping_zones (name, country_codes, sector, rate_cents, sort_order) values
  ('Santo Domingo Oeste', array['DO'], 'Santo Domingo Oeste', 400, 1),
  ('Santo Domingo Norte', array['DO'], 'Santo Domingo Norte', 600, 3),
  ('Santo Domingo Este', array['DO'], 'Santo Domingo Este', 700, 4);
