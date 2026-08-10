-- ---------------------------------------------------------------------------
-- 019 - Tags grow up: their own page, their own badge, their own order.
--
-- A tag used to be a name and a slug, ticked on a product and read back by two
-- hardcoded slugs in the card template ('new' printed a New badge, 'trade' a
-- Trade price one). Nothing else about a tag could be said, and there was no
-- screen to make one with. These columns give a tag the vocabulary the admin
-- Tags page now edits:
--
--   description        - the wording on the tag's own page, and the fallback
--                        meta description. Plain text, like a category's.
--   storefront_visible - false keeps the tag for filing only: it still filters
--                        in the admin and still drives nothing on the shop, and
--                        its page 404s. True (the default, so every existing
--                        tag keeps behaving) puts it on the site.
--   badge_*            - an owner-defined card badge in place of the two magic
--                        slugs. `badge_enabled` opts in; `badge_label` prints
--                        (the tag's name when blank); the four colour columns
--                        are light/dark pairs for background and text, held as
--                        whatever the colour picker produced - a hex, or any
--                        other plain CSS colour. They are frozen values, NOT
--                        `var(--color-N)` references: the palette vars are
--                        index-numbered and re-point the moment somebody
--                        reorders Appearance. Every one of them is passed
--                        through lib/design/tokens' cssValue() before it is
--                        allowed near an inline style.
--   position           - the order the admin list shows, and badge precedence
--                        when a product carries two badge tags (lowest wins,
--                        matching shp_categories' position).
--   meta_title,
--   meta_description   - SEO for the tag's page, same pair shp_categories has.
--   auto_rule          - NULL for an ordinary tag, which is ticked on a product
--                        by hand and recorded in shp_product_tags. 'sale' for
--                        the pre-made "On Sale" tag seeded below, whose
--                        membership is worked out at read time instead: a
--                        product is in it while it has a sale price that
--                        undercuts its normal one, or while any of its
--                        variations does. Nothing is ever written to
--                        shp_product_tags for it, which is the point - a stored
--                        membership would go stale the moment a price changed
--                        somewhere this module cannot see.
--
-- Idempotent, so it re-applies cleanly on an install whose 001 already carries
-- the columns (fresh installs get them there; existing installs get them here).
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_tags" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "shp_tags" ADD COLUMN IF NOT EXISTS "storefront_visible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "shp_tags" ADD COLUMN IF NOT EXISTS "badge_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "shp_tags" ADD COLUMN IF NOT EXISTS "badge_label" TEXT;
ALTER TABLE "shp_tags" ADD COLUMN IF NOT EXISTS "badge_bg" TEXT;
ALTER TABLE "shp_tags" ADD COLUMN IF NOT EXISTS "badge_bg_dark" TEXT;
ALTER TABLE "shp_tags" ADD COLUMN IF NOT EXISTS "badge_text" TEXT;
ALTER TABLE "shp_tags" ADD COLUMN IF NOT EXISTS "badge_text_dark" TEXT;
ALTER TABLE "shp_tags" ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "shp_tags" ADD COLUMN IF NOT EXISTS "meta_title" TEXT;
ALTER TABLE "shp_tags" ADD COLUMN IF NOT EXISTS "meta_description" TEXT;
ALTER TABLE "shp_tags" ADD COLUMN IF NOT EXISTS "auto_rule" TEXT;

-- The list is read in position order with name as the tie-break, so an install
-- whose tags all sit at 0 still reads alphabetically until somebody drags one.
CREATE INDEX IF NOT EXISTS "shp_tags_position_idx" ON "shp_tags" ("position");

-- The one tag every shop gets for free. Colours are a starting point, not a
-- rule: the Tags screen edits all of them, and an owner who would rather it said
-- "Reduced" in their own green renames it without anything downstream noticing.
-- ON CONFLICT DO NOTHING on both unique columns, so an install that already has
-- a tag of that name (or that has since renamed this one) is left alone rather
-- than having a second one forced on it.
INSERT INTO "shp_tags" ("name", "slug", "description", "badge_enabled", "badge_label", "badge_bg", "badge_bg_dark", "badge_text", "badge_text_dark", "auto_rule")
VALUES ('On Sale', 'on-sale', 'Everything with money off at the moment.', true, 'Sale', '#b91c1c', '#f87171', '#ffffff', '#450a0a', 'sale')
ON CONFLICT DO NOTHING;
