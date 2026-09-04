-- Splits the placeholder "Pais local" (CO) zone into 4 priced Santo Domingo
-- sectors. The business operates from Dominican Republic, not Colombia -
-- CO was a seed placeholder from before the real shipping data existed.
alter table shipping_zones add column sector text;

delete from shipping_zones where name = 'Pais local' and country_codes = array['CO'];

insert into shipping_zones (name, country_codes, sector, rate_cents, sort_order) values
  ('Santo Domingo Oeste', array['DO'], 'Santo Domingo Oeste', 400, 1),
  ('Distrito Nacional', array['DO'], 'Distrito Nacional', 500, 2),
  ('Santo Domingo Norte', array['DO'], 'Santo Domingo Norte', 600, 3),
  ('Santo Domingo Este', array['DO'], 'Santo Domingo Este', 700, 4);
