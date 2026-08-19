import { prisma } from '@/lib/db/prisma'
import type { MediaReferenceChange } from '@/lib/media/reference-rewriters'

// Provider for the core.media-reference-rewriters extension point.
//
// The shop keeps a product image's public url in shp_product_media.url (the
// digital-product download url in shp_digital_files.url, a category's own
// picture in shp_categories.image_url), each column holding the media item's url
// verbatim - the editor saves the picker's Media.url unchanged. When core moves a
// blob (optimise to WebP, resize, rename, replace), the item's url changes but
// these columns still name the old, now-deleted blob, so product images,
// downloads and category cards 404. Repoint them onto the new url.
//
// Equality, not substring: the column IS the whole url, so `= oldUrl` cannot
// touch an unrelated row, and the same image used on two products is repointed on
// both. Only the url pair matters - the url changes whenever the blob moves, so
// there is nothing left for the key/id pair to catch in a url-only column.
export async function shopMediaReferenceRewriter(change: MediaReferenceChange): Promise<void> {
  const { oldUrl, newUrl } = change
  if (!oldUrl || oldUrl === newUrl) return

  await prisma.$executeRaw`
    UPDATE "shp_product_media" SET "url" = ${newUrl} WHERE "url" = ${oldUrl}
  `
  await prisma.$executeRaw`
    UPDATE "shp_digital_files" SET "url" = ${newUrl} WHERE "url" = ${oldUrl}
  `
  await prisma.$executeRaw`
    UPDATE "shp_categories" SET "image_url" = ${newUrl} WHERE "image_url" = ${oldUrl}
  `

  // A product's designed description is a Puck document held here, and the
  // feature videos and photographs inside it are addressed by url. Core rewrites
  // the builder JSON it owns - pages and layouts - and cannot see this column, so
  // a re-filed product used to keep its gallery and lose its description videos.
  // Prefiltered by a literal substring search so only the products that mention
  // the old url are read back; the swap is done on the serialised JSON, where a
  // url is an opaque string that no escaping applies to.
  const described = await prisma.$queryRaw<{ id: string; descriptionPuck: string }[]>`
    SELECT "id", "description_puck"::text AS "descriptionPuck"
    FROM "shp_products"
    WHERE position(${oldUrl} in "description_puck"::text) > 0
  `
  for (const row of described) {
    const rewritten = row.descriptionPuck.split(oldUrl).join(newUrl)
    if (rewritten === row.descriptionPuck) continue
    await prisma.$executeRaw`
      UPDATE "shp_products" SET "description_puck" = ${rewritten}::jsonb WHERE "id" = ${row.id}
    `
  }
}
