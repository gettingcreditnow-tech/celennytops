insert into shipping_zones (name, country_codes, rate_cents, sort_order) values
  ('Pais local', array['CO'], 500, 1),
  ('Latinoamerica', array['MX','AR','PE','CL','EC','BR','VE','UY','PY','BO'], 1200, 2),
  ('Resto del mundo', array['*'], 2500, 3);
