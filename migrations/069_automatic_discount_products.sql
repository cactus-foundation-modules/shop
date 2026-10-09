-- ---------------------------------------------------------------------------
-- 069 - Automatic discounts pinned to products, with a minimum quantity.
--
-- An automatic discount used to read the whole basket and nothing else. An
-- owner wanting "10% off when you buy six or more of these chairs" had no way
-- to say which chairs, or six.
--
-- `applies_to` says which: 'ALL' is the basket, exactly as every rule already
-- made behaves (hence the default); 'PRODUCTS' is the listings in
-- shp_automatic_discount_products. Said outright rather than inferred from
-- "has rows": a product deleted from the catalogue cascades out of that table,
-- and a rule whose last product went with it must apply to nothing - not
-- quietly widen itself to every order in the shop.
--
-- `minimum_quantity` is how many of the matched items the basket has to hold,
-- counted together across every product picked (four of one chair and two of
-- another is six). NULL is no minimum. On a whole-basket rule it counts every
-- item in the basket.
--
-- Idempotent, and 001 carries the same for a fresh install.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_automatic_discounts" ADD COLUMN IF NOT EXISTS "applies_to" TEXT NOT NULL DEFAULT 'ALL'
    CONSTRAINT "shp_automatic_discounts_applies_to_check" CHECK ("applies_to" IN ('ALL', 'PRODUCTS'));
ALTER TABLE "shp_automatic_discounts" ADD COLUMN IF NOT EXISTS "minimum_quantity" INTEGER
    CONSTRAINT "shp_automatic_discounts_minimum_quantity_check" CHECK ("minimum_quantity" IS NULL OR "minimum_quantity" >= 1);

CREATE TABLE IF NOT EXISTS "shp_automatic_discount_products" (
    "discount_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,

    CONSTRAINT "shp_automatic_discount_products_pkey" PRIMARY KEY ("discount_id", "product_id"),
    CONSTRAINT "shp_automatic_discount_products_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "shp_automatic_discounts"("id") ON DELETE CASCADE,
    CONSTRAINT "shp_automatic_discount_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shp_products"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "shp_automatic_discount_products_product_id_idx" ON "shp_automatic_discount_products" ("product_id");
