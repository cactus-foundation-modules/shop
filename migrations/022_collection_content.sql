-- ---------------------------------------------------------------------------
-- 022 - Collections get the same content vocabulary categories already have.
--
-- Until now a collection carried one plain-text "description" doing two jobs at
-- once: the blurb on its card, and the whole of the copy on its page. Categories
-- stopped doing that in 012_category_content.sql, and filter collections were
-- built with the split from the start. These two columns bring collections into
-- line, so all three page types are written up the same way:
--
--   short_description - the one-liner printed on the collection's card and under
--                       its heading, the same role shp_categories.short_description
--                       plays.
--   description_puck  - opt-in designed description. A Puck content-block
--                       document that renders in place of the plain-text
--                       "description" on the collection page when present,
--                       exactly as 012 did for categories. NULL keeps the
--                       plain-text box behaving as before.
--
-- No image column to match categories' image_url: a collection's tile already
-- takes its cover from its first member (see listCollectionsForIndex), and
-- inventing a second source for the same picture would only be a thing to keep
-- in step.
--
-- Idempotent, so it re-applies cleanly on any install whose 001 already carries
-- the columns (fresh installs get them there; existing installs get them here).
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_collections" ADD COLUMN IF NOT EXISTS "short_description" TEXT;
ALTER TABLE "shp_collections" ADD COLUMN IF NOT EXISTS "description_puck" JSONB;

-- Carry every existing description over to the new shape rather than leaving the
-- split half-done. A collection's one description has been doing the blurb's job
-- all along - it is what the card printed and what sat under the heading - so it
-- becomes the blurb, and the page reads exactly as it did before the split.
--
-- Only where the blurb is still empty, so a re-run cannot overwrite a one-liner
-- someone has since written, and only where there is something to copy.
--
-- The long "description" is left alone: it is the same text for now, printed by
-- nothing until an owner adds the Collection Description block, and blanking it
-- would throw away the only copy an install has.
UPDATE "shp_collections"
   SET "short_description" = "description"
 WHERE "short_description" IS NULL
   AND "description" IS NOT NULL
   AND btrim("description") <> '';
