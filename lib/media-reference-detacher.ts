import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { MediaReferenceDetach } from '@/lib/media/reference-detachers'

// Provider for the core.media-reference-detachers extension point.
//
// The shop's companion to media-reference-rewriter.ts. That one runs when a blob
// MOVES and repoints each column onto the new url; this one runs when the item is
// being deleted outright, where there is no new url to point at and the only
// honest answer is to take the reference off.
//
// The case this exists for: an owner deletes a photograph in the media library,
// clicks through the "still in use" warning because they meant it, and the
// product page then draws a gallery row whose url names a blob that is no longer
// there. Nothing else notices - the row is perfectly valid - so it stays broken
// until somebody spots it on the storefront.
//
// What is deliberately LEFT attached, and why:
//
//   - shp_digital_files.url. Somebody has paid for that download. Quietly
//     dropping the row turns a refundable "the file is missing" into a silent
//     "there was never a file", and re-attaching it needs the file back either
//     way. The 409 warning names it; a person decides.
//   - shp_order_request_photos and shp_shipments.signature_url/_key. A customer's
//     photograph of a damaged delivery and a courier's proof of delivery are
//     evidence, kept for the day there is an argument. A library tidy-up is not
//     the event that should erase either.
//   - description_puck. A url inside a builder document belongs to a block with
//     its own layout and copy around it. "Detaching" it means deciding whether
//     the block goes, shrinks or shows a gap, which is an editor's judgement and
//     not a sweep's.
export async function shopMediaReferenceDetacher(media: MediaReferenceDetach): Promise<void> {
  const { id, url } = media
  if (!url) return

  // The products whose galleries are about to lose a row, read BEFORE the delete
  // - afterwards there is nothing left to tell us which they were.
  const affected = await prisma.$queryRaw<{ product_id: string }[]>`
    SELECT DISTINCT "product_id" FROM "shp_product_media" WHERE "url" = ${url}
  `
  const productIds = affected.map((r) => r.product_id)

  const writes: Prisma.PrismaPromise<unknown>[] = [
    // The gallery row goes entirely. A row with its url blanked would render as a
    // hole in the strip, which is the thing being fixed.
    prisma.$executeRaw`DELETE FROM "shp_product_media" WHERE "url" = ${url}`,
    // The SMALL COPY, on the other hand, is not the picture - it is a derived
    // file, and the original is still there. So the column is nulled rather than
    // the row dropped, and every card falls back to drawing the full-size
    // original: heavier, and right.
    prisma.$executeRaw`UPDATE "shp_product_media" SET "thumb_url" = NULL WHERE "thumb_url" = ${url}`,
    prisma.$executeRaw`UPDATE "shp_categories" SET "image_url" = NULL WHERE "image_url" = ${url}`,
    // These four hold a Media ID rather than a url.
    prisma.$executeRaw`UPDATE "shp_products" SET "og_image_id" = NULL WHERE "og_image_id" = ${id}`,
    prisma.$executeRaw`UPDATE "shp_collections" SET "image_id" = NULL WHERE "image_id" = ${id}`,
    prisma.$executeRaw`UPDATE "shp_collections" SET "og_image_id" = NULL WHERE "og_image_id" = ${id}`,
    prisma.$executeRaw`UPDATE "shp_categories" SET "og_image_id" = NULL WHERE "og_image_id" = ${id}`,
  ]

  if (productIds.length > 0) {
    const ids = Prisma.join(productIds)
    writes.push(
      // Close the gap the deleted row left. `position` is what the gallery orders
      // by and what the detail block's "first three, then the rest" split counts
      // against, so a hole in the sequence is not cosmetic.
      prisma.$executeRaw`
        UPDATE "shp_product_media" AS m
        SET "position" = r."rn" - 1
        FROM (
          SELECT "id", row_number() OVER (
            PARTITION BY "product_id" ORDER BY "position" ASC, "created_at" ASC
          ) AS "rn"
          FROM "shp_product_media"
          WHERE "product_id" IN (${ids})
        ) AS r
        WHERE m."id" = r."id" AND m."position" <> r."rn" - 1
      `,
      // Deleting the MAIN photograph leaves a product with no primary at all, and
      // every surface that asks for "the product's picture" then gets nothing
      // while the gallery below it is full of photographs. Promote the first
      // remaining one, and only for the products that actually lost theirs.
      prisma.$executeRaw`
        UPDATE "shp_product_media" AS m
        SET "is_primary" = true
        WHERE m."id" IN (
          SELECT DISTINCT ON (p."product_id") p."id"
          FROM "shp_product_media" AS p
          WHERE p."product_id" IN (${ids})
          ORDER BY p."product_id", p."position" ASC, p."created_at" ASC
        )
        AND NOT EXISTS (
          SELECT 1 FROM "shp_product_media" AS q
          WHERE q."product_id" = m."product_id" AND q."is_primary"
        )
      `,
    )
  }

  await prisma.$transaction(writes)
}
