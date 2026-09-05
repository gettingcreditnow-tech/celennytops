-- Lets the admin turn the home-page free-shipping banner on/off without
-- touching the threshold itself (some promos are active but shouldn't be
-- advertised, or the owner just wants a quieter homepage for a while).
alter table store_settings
  add column show_free_shipping_banner boolean not null default true;
