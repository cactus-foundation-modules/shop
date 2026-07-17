import { prisma } from '@/lib/db/prisma'
import type { MediaReferenceChange } from '@/lib/media/reference-rewriters'

// Provider for the core.media-reference-rewriters extension point.
//
// The shop keeps a product image's public url in shp_product_media.url (and the
// digital-product download url in shp_digital_files.url), each column holding the
// media item's url verbatim - the product editor saves the picker's Media.url
// unchanged. When core moves a blob (optimise to WebP, resize, rename, replace),
// the item's url changes but these columns still name the old, now-deleted blob,
// so product images and downloads 404. Repoint them onto the new url.
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
}
