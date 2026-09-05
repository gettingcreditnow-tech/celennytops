-- Lets the shop contact a customer about delivery (both shipping methods
-- coordinate a real handoff in Santo Domingo). Existing orders get an
-- empty string via the default; every new order going forward supplies a
-- real value from the checkout form.
alter table orders add column customer_phone text not null default '';
