-- ---------------------------------------------------------------------------
-- 012 - Categories get their own content: a card blurb, a designed description
-- and a picture.
--
-- Until now a category carried one plain-text "description" and nothing else, so
-- a category page could only ever list its sub-categories as bare name pills.
-- These three columns give a category the same content vocabulary a product has:
--
--   short_description - the one-liner printed on the category's card, the same
--                       role shp_products.short_description plays.
--   description_puck  - opt-in designed description. A Puck content-block
--                       document that renders in place of the plain-text
--                       "description" on the category page when present, exactly
--                       as 011_description_puck.sql did for products. NULL keeps
--                       the plain-text box behaving as before.
--   image_url         - the category's picture. Holds the media item's url
--                       verbatim, the same convention shp_product_media.url uses
--                       (so a server render needs no lookup, and
--                       lib/media-reference-rewriter.ts repoints it when core
--                       moves the blob). Deliberately NOT a Media id like
--                       shp_collections.image_id, which nothing renders.
--
-- Idempotent, so it re-applies cleanly on any install whose 001 already carries
-- the columns (fresh installs get them there; existing installs get them here).
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_categories" ADD COLUMN IF NOT EXISTS "short_description" TEXT;
ALTER TABLE "shp_categories" ADD COLUMN IF NOT EXISTS "description_puck" JSONB;
ALTER TABLE "shp_categories" ADD COLUMN IF NOT EXISTS "image_url" TEXT;
