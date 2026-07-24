-- Per-product designed description. A Puck content-block document that, when
-- present, renders in place of the plain-text "description" in the storefront's
-- Description tab. Nullable and opt-in: NULL keeps the plain-text box behaving
-- exactly as before. Idempotent so it is harmless on installs whose 001 already
-- carries the column.
ALTER TABLE "shp_products" ADD COLUMN IF NOT EXISTS "description_puck" JSONB;
