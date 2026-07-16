import { prisma } from '@/lib/db/prisma'
import { getOrCreateFolderByPath, moveOrRenameMedia } from '@/lib/media/organise'
import { getProductById } from '@/modules/shop/lib/db/products'
import { getCategoryById } from '@/modules/shop/lib/db/catalogue'

// ---------------------------------------------------------------------------
// Product image filing.
//
// Every image attached to a product is filed in the core media library under
//   Shop / <master category> / <product> / <product-slug><n>
// (n is the image's 1-based position). The master category names the category
// folder and the product name names the folder inside it; products with no
// master land under "Uncategorised". Only images that resolve to a managed core
// Media row are moved - externally-hosted urls and video embeds are left
// untouched. Runs on every product save, after the media list has been written,
// and is idempotent: an image already in the right place with the right name is
// a no-op (no blob copy).
//
// The per-product folder is what lets a product's variation images sit beside
// its own: a dependent module (shop-variations) files a variant's image by
// passing the parent as `folderProductId`, so the image is named from the
// variant's own slug but lands in the parent's folder.
//
// The exact-name flag on the core relocate keeps the stored key free of the
// usual nanoid, so the url reads shop/<category>/<product>/<slug><n>.<ext>
// exactly. Names are globally unique (slug is unique, n is the position), so the
// caller safely owns collision within the folder - two products sharing a name
// share a folder without either clobbering the other.
//
// The editor also resolves this folder up front (getProductMediaFolderId) and
// uploads new images straight into it. Filing on save alone was not enough: an
// upload that is never saved, or saved while any part of the move fails, simply
// stayed in the library root, which is where product images had been piling up.
// ---------------------------------------------------------------------------

const UNCATEGORISED_FOLDER = 'Uncategorised'

/**
 * The library folder a product's images belong in, created if it does not exist
 * yet: Shop / <master category> / <product>.
 *
 * `masterCategoryId` overrides the product's saved master, which is what lets
 * the editor file an upload under the category currently picked on screen
 * rather than the one last saved. `folderProductId` files under another
 * product's folder (see the header note).
 */
export async function getProductMediaFolderId(
  productId: string,
  options: { folderProductId?: string; masterCategoryId?: string | null } = {},
): Promise<string | null> {
  const folderProductId = options.folderProductId ?? productId
  const folderProduct = await getProductById(folderProductId)
  if (!folderProduct) return null

  const masterCategoryId = options.masterCategoryId !== undefined
    ? options.masterCategoryId
    : folderProduct.masterCategoryId

  let categoryName = UNCATEGORISED_FOLDER
  if (masterCategoryId) {
    const category = await getCategoryById(masterCategoryId)
    if (category) categoryName = category.name
  }

  return getOrCreateFolderByPath(['Shop', categoryName, folderProduct.name])
}

export async function reorganiseProductMedia(
  productId: string,
  options: { folderProductId?: string } = {},
): Promise<void> {
  const product = await getProductById(productId)
  if (!product) return

  // Images are normally filed under their own product; `folderProductId` files
  // them under another product's folder instead (see the header note).
  const folderId = await getProductMediaFolderId(productId, options)
  if (folderId === null) return

  const images = await prisma.$queryRaw<{ url: string }[]>`
    SELECT "url" FROM "shp_product_media"
    WHERE "product_id" = ${productId} AND "type" = 'IMAGE'
    ORDER BY "position" ASC
  `

  let index = 0
  for (const { url } of images) {
    index += 1
    const media = await prisma.media.findFirst({ where: { url }, select: { id: true } })
    if (!media) continue // externally-hosted or otherwise unmanaged - leave as-is

    try {
      const updated = await moveOrRenameMedia(media.id, {
        targetFolderId: folderId,
        newName: `${product.slug}${index}`,
        exactName: true,
        collision: 'replace',
      })
      if (updated && updated.url !== url) {
        await prisma.$executeRaw`
          UPDATE "shp_product_media" SET "url" = ${updated.url}
          WHERE "product_id" = ${productId} AND "url" = ${url}
        `
      }
    } catch (err) {
      // A single image failing to relocate (provider hiccup, missing blob) must
      // not fail the whole save - the row keeps its current url and can be
      // re-filed on the next save. Say so in the log though: swallowing this
      // silently is how every product image ended up sat in the library root
      // with nothing anywhere reporting a problem.
      console.warn(`[shop] could not file image ${url} for product ${productId}:`, err)
    }
  }
}
