-- The small copy of a product picture, for the surfaces that draw it small.
--
-- A category grid draws its cards at around 300px and the thumbnail strip under a
-- product photo draws them at 64px, but both were being handed the original - a
-- 646 KB studio photograph on the live catalogue, at 300px. One category page was
-- shipping 5.5 MB of pictures to do a job that wants well under a tenth of it.
--
-- Core makes and files the copy (lib/media/renditions.ts, 300px, named
-- "<original>-thumb.webp" beside its original). This column is where the product's
-- pictures remember which copy is theirs, so a grid needs no extra query per card
-- to find it.
--
-- Nullable, and null is a perfectly good answer: an external host we have no bytes
-- for, a format not worth shrinking (SVG scales, GIF may animate), a picture
-- already small enough, or simply one the backfill has not reached yet. Every
-- renderer falls back to the original, which is heavier but never wrong.
--
-- Variation photographs need nothing of their own: a variation is a child product
-- and its pictures are rows in this same table.
--
-- Idempotent: safe on an install that already has the column.

ALTER TABLE "shp_product_media" ADD COLUMN IF NOT EXISTS "thumb_url" TEXT;

-- The backfill and the "how many are outstanding?" count both ask for image rows
-- with no small copy yet. Partial, so it indexes only the work left to do and
-- shrinks to nothing as the backfill completes.
CREATE INDEX IF NOT EXISTS "shp_product_media_thumb_pending_idx"
  ON "shp_product_media" ("id")
  WHERE "thumb_url" IS NULL AND "type" = 'IMAGE';
