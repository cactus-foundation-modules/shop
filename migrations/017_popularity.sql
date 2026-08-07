-- Best-seller ordering. Two columns, because the two halves answer different
-- questions and only one of them is derived:
--
-- 1. popularity_seed - a starting rank the shop is given rather than earns. A
--    supplier's own best-seller order, an owner's hand-set favourite, whatever
--    the site has before it has sales of its own. Higher is better; NULL means
--    "no opinion". Never written by the recompute, so importing a fresh set of
--    ranks or hand-editing one is safe.
-- 2. popularity - the figure everything actually sorts on, derived from the seed
--    plus what the shop has genuinely sold. Recomputed; never hand-edited.
--
-- A new shop with no orders sorts entirely on the seed, which is the point: a
-- best-seller list that needs a year of trading before it says anything useful
-- is not much of a best-seller list.
--
-- Idempotent, and matches 001 for fresh installs.

ALTER TABLE "shp_products" ADD COLUMN IF NOT EXISTS "popularity_seed" INTEGER;
ALTER TABLE "shp_products" ADD COLUMN IF NOT EXISTS "popularity" INTEGER;

-- Sorted on directly by the admin grid and the storefront query, both of which
-- want the best sellers first and the never-scored ones last.
CREATE INDEX IF NOT EXISTS "shp_products_popularity_idx" ON "shp_products" ("popularity" DESC NULLS LAST);
