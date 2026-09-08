-- Postcodes a shipping zone deliberately does NOT cover.
--
-- The inclusion list answers "which zone is this shopper in"; this one answers
-- "and definitely not this one", which is a different question and cannot be
-- expressed as a prefix. A shop delivering to mainland Britain has one catch-all
-- zone and wants the Highlands, the islands and Northern Ireland carved out of
-- it - there is no prefix list that says that, only a list of what to take back
-- out again.
--
-- JSONB to match "postcodes" on the same table, so both lists serialise and
-- restore by the identical path.
ALTER TABLE "shp_shipping_zones"
  ADD COLUMN IF NOT EXISTS "excluded_postcodes" JSONB NOT NULL DEFAULT '[]';
