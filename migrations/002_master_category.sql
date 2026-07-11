-- ---------------------------------------------------------------------------
-- 002 - Master (primary) category per product.
--
-- Products may belong to any number of categories (shp_product_categories);
-- this column marks the lead one. It drives where the product's uploaded images
-- are filed in the media library: shop/<master category>/<product slug>N.
--
-- Idempotent so it re-applies cleanly on any install that already has the column
-- (fresh installs get it from 001; existing installs get it from here).
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_products" ADD COLUMN IF NOT EXISTS "master_category_id" TEXT;

DO $$ BEGIN
    ALTER TABLE "shp_products"
        ADD CONSTRAINT "shp_products_master_category_id_fkey"
        FOREIGN KEY ("master_category_id") REFERENCES "shp_categories"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "shp_products_master_category_id_idx" ON "shp_products" ("master_category_id");
