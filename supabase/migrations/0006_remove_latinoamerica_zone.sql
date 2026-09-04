-- The store now ships only within the Dominican Republic (checkout fixes
-- countryCode to "DO" and offers no other destination), so the Latinoamerica
-- zone is unreachable from the storefront and only cluttered the admin
-- shipping-zones list. Removed rather than left as a dead row.
delete from shipping_zones where name = 'Latinoamerica';
