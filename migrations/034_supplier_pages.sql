-- ---------------------------------------------------------------------------
-- 034 - Suppliers get a page of their own.
--
-- Until now a supplier was filing: a name on a product and an address book entry
-- behind it, with nothing a shopper could ever reach. A shop that sells other
-- people's ranges wants the other thing too - one page per supplier, listing
-- everything of theirs, written up properly and linkable from the site menu.
--
-- That needs the same content vocabulary categories (012) and collections (022)
-- already have, plus an address to live at and a switch to say whether it is
-- published:
--
--   slug               - the page's address, /shop/suppliers/<slug>. Typed by
--                        the owner rather than following the name around,
--                        because changing it stops old links working - the same
--                        reasoning collections are built on.
--   storefront_visible - false keeps the supplier as filing only, which is what
--                        every existing row is until somebody decides otherwise.
--                        Hence DEFAULT false here and DEFAULT true nowhere: a
--                        migration must not publish four hundred pages nobody
--                        has written a word on.
--   short_description  - the one-liner under the heading and on any card.
--   description        - the write-up: a paragraph or two, plain text.
--   description_puck   - opt-in designed write-up. A Puck content-block document
--                        rendered in place of the plain text when present,
--                        exactly as 012 and 022 do. NULL keeps the plain box.
--   meta_title /
--   meta_description   - how the page reads in search results. Blank falls back
--                        to the name and the short description.
--
-- Products are still linked to a supplier BY NAME (see 007), so nothing here
-- changes how a supplier's products are found - the page matches on the same
-- shp_products."supplier" column the counts on the admin screen already use, and
-- the index 007 put on it serves both.
--
-- Idempotent throughout, so it re-applies cleanly on an install whose 007
-- already carries the columns.
-- ---------------------------------------------------------------------------

ALTER TABLE "shp_suppliers" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "shp_suppliers" ADD COLUMN IF NOT EXISTS "storefront_visible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "shp_suppliers" ADD COLUMN IF NOT EXISTS "short_description" TEXT;
ALTER TABLE "shp_suppliers" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "shp_suppliers" ADD COLUMN IF NOT EXISTS "description_puck" JSONB;
ALTER TABLE "shp_suppliers" ADD COLUMN IF NOT EXISTS "meta_title" TEXT;
ALTER TABLE "shp_suppliers" ADD COLUMN IF NOT EXISTS "meta_description" TEXT;

-- Every existing supplier gets an address, so switching one on is one tick
-- rather than a tick and a slug nobody was told to think about. Lower-cased,
-- punctuation collapsed to single hyphens, hyphens trimmed off both ends - the
-- same shape the rest of the shop's slugs take. A name with nothing slug-shaped
-- in it at all ("&") would come out empty, which is not an address, so those
-- fall back to "supplier" and get numbered by the de-duplication below.
UPDATE "shp_suppliers"
   SET "slug" = COALESCE(
         NULLIF(btrim(regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'), '-'), ''),
         'supplier'
       )
 WHERE "slug" IS NULL;

-- Names are unique case-insensitively; the slugs derived from them are not
-- ("A & B" and "A&B" both become "a-b"). Number the runners-up rather than
-- letting the unique index below fail the whole migration. Oldest row keeps the
-- clean address, which is the one most likely to be linked to already.
WITH ranked AS (
  SELECT "id",
         "slug",
         row_number() OVER (PARTITION BY "slug" ORDER BY "created_at" ASC, "id" ASC) AS n
    FROM "shp_suppliers"
   WHERE "slug" IS NOT NULL
)
UPDATE "shp_suppliers" s
   SET "slug" = ranked."slug" || '-' || ranked.n
  FROM ranked
 WHERE ranked."id" = s."id"
   AND ranked.n > 1;

-- Case-insensitive, matching how the name is stored: the slug is the public
-- address, and two suppliers differing only in case would make one of the two
-- pages unreachable. Partial, because the column is nullable in principle even
-- though the back-fill above leaves none null in practice.
CREATE UNIQUE INDEX IF NOT EXISTS "shp_suppliers_slug_lower_key"
    ON "shp_suppliers" (LOWER("slug")) WHERE "slug" IS NOT NULL;
