-- ---------------------------------------------------------------------------
-- 003 - Unlimited-depth category nesting.
--
-- Categories already carry a self-referential parent_id (from 001), but two
-- things change for real nested sub-categories:
--
--   1. product_display_mode: per-category override for how a category page
--      lists products. NULL = inherit the shop-wide default; 'rollup' = also
--      list every descendant category's products; 'exact' = direct only.
--
--   2. parent_id FK flips from ON DELETE SET NULL to ON DELETE CASCADE, so
--      deleting a category removes its whole sub-tree rather than promoting the
--      children to root. Product links vanish with the categories (via
--      shp_product_categories' own CASCADE); the products themselves survive
--      because master_category_id is ON DELETE SET NULL.
--
-- Idempotent: fresh installs get all of this from 001; existing installs get it
-- here, and the whole file re-applies cleanly.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_categories" ADD COLUMN IF NOT EXISTS "product_display_mode" TEXT;

-- Swap the parent_id FK to ON DELETE CASCADE. Drop-then-add is safe to re-run.
ALTER TABLE "shp_categories" DROP CONSTRAINT IF EXISTS "shp_categories_parent_id_fkey";

ALTER TABLE "shp_categories"
    ADD CONSTRAINT "shp_categories_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "shp_categories"("id") ON DELETE CASCADE;
