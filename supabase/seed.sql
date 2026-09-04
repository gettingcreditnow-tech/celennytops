insert into shipping_zones (name, country_codes, sector, rate_cents, sort_order) values
  ('Santo Domingo Oeste', array['DO'], 'Santo Domingo Oeste', 400, 1),
  ('Distrito Nacional', array['DO'], 'Distrito Nacional', 500, 2),
  ('Santo Domingo Norte', array['DO'], 'Santo Domingo Norte', 600, 3),
  ('Santo Domingo Este', array['DO'], 'Santo Domingo Este', 700, 4),
  ('Resto del mundo', array['*'], null, 2500, 6);

-- Celenny Tops Fase 1 catalog seed: crochet baby booties & slide sandals
insert into products (id, name_es, name_en, description_es, description_en, category, images, is_active) values
  ('5f66e862-b12f-4e49-af0a-992bc8536438', 'Zapatitos Mary Jane con moño y diadema - Rosa', 'Mary Jane Bow Booties & Headband Set - Pink', 'Zapatitos estilo Mary Jane tejidos a mano en crochet, con moño y detalle de perla. Incluye diadema a juego.', 'Handmade crochet Mary Jane booties with a bow and pearl detail. Includes a matching headband.', 'calzado', array['/products/mary-jane-pink/1.jpg', '/products/mary-jane-pink/2.jpg'], true),
  ('1a7b1331-14d4-45a5-8217-a6fb61e33abd', 'Zapatitos Mary Jane con moño y diadema - Blanco', 'Mary Jane Bow Booties & Headband Set - White', 'Zapatitos estilo Mary Jane tejidos a mano en crochet, con moño y detalle de perla. Incluye diadema a juego.', 'Handmade crochet Mary Jane booties with a bow and pearl detail. Includes a matching headband.', 'calzado', array['/products/mary-jane-white/1.jpg', '/products/mary-jane-white/2.jpg'], true),
  ('ef85c297-692b-4565-afcd-799231c5c39b', 'Zapatitos Mary Jane con moño y diadema - Beige', 'Mary Jane Bow Booties & Headband Set - Beige', 'Zapatitos estilo Mary Jane tejidos a mano en crochet, con moño y detalle de perla. Incluye diadema a juego.', 'Handmade crochet Mary Jane booties with a bow and pearl detail. Includes a matching headband.', 'calzado', array['/products/mary-jane-beige/1.jpg', '/products/mary-jane-beige/2.jpg'], true),
  ('02b58965-f601-46d1-b6d5-9d2646308679', 'Zapatitos Mary Jane con moño y diadema - Morado', 'Mary Jane Bow Booties & Headband Set - Purple', 'Zapatitos estilo Mary Jane tejidos a mano en crochet, con moño y detalle de perla. Incluye diadema a juego.', 'Handmade crochet Mary Jane booties with a bow and pearl detail. Includes a matching headband.', 'calzado', array['/products/mary-jane-purple/1.jpg', '/products/mary-jane-purple/2.jpg'], true),
  ('82d81160-c06c-457e-a628-cbdad10895d2', 'Sandalias slide de crochet - Negro', 'Crochet Slide Sandals - Black', 'Sandalias tipo slide tejidas a mano en crochet, suaves y comodas para bebe.', 'Handmade crochet slide sandals, soft and comfortable for baby.', 'calzado', array['/products/slides-black/1.jpg', '/products/slides-black/2.jpg'], true),
  ('f48b5bae-e4a1-4021-9639-117cfcfcb554', 'Sandalias slide de crochet - Rosa', 'Crochet Slide Sandals - Pink', 'Sandalias tipo slide tejidas a mano en crochet, suaves y comodas para bebe.', 'Handmade crochet slide sandals, soft and comfortable for baby.', 'calzado', array['/products/slides-pink/1.jpg', '/products/slides-pink/2.jpg'], true);

insert into product_variants (product_id, size, color, price_cents, sku, stock) values
  ('5f66e862-b12f-4e49-af0a-992bc8536438', '0-3 meses', 'Rosa', 1200, 'MJ-PINK-0-3', 5),
  ('5f66e862-b12f-4e49-af0a-992bc8536438', '3-6 meses', 'Rosa', 1200, 'MJ-PINK-3-6', 5),
  ('5f66e862-b12f-4e49-af0a-992bc8536438', '6-9 meses', 'Rosa', 1200, 'MJ-PINK-6-9', 5),
  ('5f66e862-b12f-4e49-af0a-992bc8536438', '9-12 meses', 'Rosa', 1200, 'MJ-PINK-9-12', 5),
  ('1a7b1331-14d4-45a5-8217-a6fb61e33abd', '0-3 meses', 'Blanco', 1200, 'MJ-WHITE-0-3', 5),
  ('1a7b1331-14d4-45a5-8217-a6fb61e33abd', '3-6 meses', 'Blanco', 1200, 'MJ-WHITE-3-6', 5),
  ('1a7b1331-14d4-45a5-8217-a6fb61e33abd', '6-9 meses', 'Blanco', 1200, 'MJ-WHITE-6-9', 5),
  ('1a7b1331-14d4-45a5-8217-a6fb61e33abd', '9-12 meses', 'Blanco', 1200, 'MJ-WHITE-9-12', 5),
  ('ef85c297-692b-4565-afcd-799231c5c39b', '0-3 meses', 'Beige', 1200, 'MJ-BEIGE-0-3', 5),
  ('ef85c297-692b-4565-afcd-799231c5c39b', '3-6 meses', 'Beige', 1200, 'MJ-BEIGE-3-6', 5),
  ('ef85c297-692b-4565-afcd-799231c5c39b', '6-9 meses', 'Beige', 1200, 'MJ-BEIGE-6-9', 5),
  ('ef85c297-692b-4565-afcd-799231c5c39b', '9-12 meses', 'Beige', 1200, 'MJ-BEIGE-9-12', 5),
  ('02b58965-f601-46d1-b6d5-9d2646308679', '0-3 meses', 'Morado', 1200, 'MJ-PURPLE-0-3', 5),
  ('02b58965-f601-46d1-b6d5-9d2646308679', '3-6 meses', 'Morado', 1200, 'MJ-PURPLE-3-6', 5),
  ('02b58965-f601-46d1-b6d5-9d2646308679', '6-9 meses', 'Morado', 1200, 'MJ-PURPLE-6-9', 5),
  ('02b58965-f601-46d1-b6d5-9d2646308679', '9-12 meses', 'Morado', 1200, 'MJ-PURPLE-9-12', 5),
  ('82d81160-c06c-457e-a628-cbdad10895d2', '0-3 meses', 'Negro', 1200, 'SL-BLACK-0-3', 5),
  ('82d81160-c06c-457e-a628-cbdad10895d2', '3-6 meses', 'Negro', 1200, 'SL-BLACK-3-6', 5),
  ('82d81160-c06c-457e-a628-cbdad10895d2', '6-9 meses', 'Negro', 1200, 'SL-BLACK-6-9', 5),
  ('82d81160-c06c-457e-a628-cbdad10895d2', '9-12 meses', 'Negro', 1200, 'SL-BLACK-9-12', 5),
  ('f48b5bae-e4a1-4021-9639-117cfcfcb554', '0-3 meses', 'Rosa', 1200, 'SL-PINK-0-3', 5),
  ('f48b5bae-e4a1-4021-9639-117cfcfcb554', '3-6 meses', 'Rosa', 1200, 'SL-PINK-3-6', 5),
  ('f48b5bae-e4a1-4021-9639-117cfcfcb554', '6-9 meses', 'Rosa', 1200, 'SL-PINK-6-9', 5),
  ('f48b5bae-e4a1-4021-9639-117cfcfcb554', '9-12 meses', 'Rosa', 1200, 'SL-PINK-9-12', 5);
