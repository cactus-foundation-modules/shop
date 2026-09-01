-- "Keep this one out of the featured shelves."
--
-- Distinct from catalogue_hidden, which is system state owned by shop-variations
-- and parks a variant child out of the catalogue entirely. This one is the
-- owner's own choice, and only about the promotional shelves an owner drops on a
-- page - Best sellers, Just in, Staff picks, On offer and the like. A product
-- flagged here still sits in its categories and collections, still turns up in
-- search, and still has its own page: it is simply not paraded on the front.
--
-- false for everything, which is the behaviour every shop had before the column
-- existed - the shelves only start leaving products out once an owner ticks one.
--
-- Idempotent, and matches 001 for fresh installs.

ALTER TABLE "shp_products" ADD COLUMN IF NOT EXISTS "featured_hidden" BOOLEAN NOT NULL DEFAULT false;

-- Sat in the WHERE of every featured shelf's query, alongside catalogue_hidden.
CREATE INDEX IF NOT EXISTS "shp_products_featured_hidden_idx" ON "shp_products" ("featured_hidden");
