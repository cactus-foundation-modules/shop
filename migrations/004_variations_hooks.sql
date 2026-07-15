-- Generic hooks that let a companion module (shop-variations) layer product
-- options on top of the shop without touching its checkout/money path.
--
-- 1. catalogue_hidden: a product row that is ACTIVE (purchasable) yet must never
--    surface in the grid, search, sitemap or on its own URL. Used for the hidden
--    child rows that back each concrete variant. Nothing shop-specific here - it
--    is a plain visibility flag, defaulting to false so every existing product is
--    unaffected.
-- 2. line_meta: per-line personalisation captured at add-to-cart (engraving text,
--    gift messages, upload references, priced choices). A resolver hook prices it
--    server-side; this column is where the normalised result is snapshotted onto
--    the order line. JSONB, nullable - an order line with no personalisation keeps
--    NULL.
--
-- Idempotent (IF NOT EXISTS) so it is harmless to re-run and matches 001 for
-- fresh installs.

ALTER TABLE "shp_products" ADD COLUMN IF NOT EXISTS "catalogue_hidden" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "shp_products_catalogue_hidden_idx" ON "shp_products" ("catalogue_hidden");

ALTER TABLE "shp_order_items" ADD COLUMN IF NOT EXISTS "line_meta" JSONB;
