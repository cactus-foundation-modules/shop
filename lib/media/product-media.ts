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
// ---------------------------------------------------------------------------

const UNCATEGORISED_FOLDER = 'Uncategorised'

export async function reorganiseProductMedia(
  productId: string,
  options: { folderProductId?: string } = {},
): Promise<void> {
  const product = await getProductById(productId)
  if (!product) return

  // Images are normally filed under their own product; `folderProductId` files
  // them under another product's folder instead (see the header note).
  const folderProduct = options.folderProductId && options.folderProductId !== productId
    ? await getProductById(options.folderProductId)
    : product
  if (!folderProduct) return

  let categoryName = UNCATEGORISED_FOLDER
  if (folderProduct.masterCategoryId) {
    const category = await getCategoryById(folderProduct.masterCategoryId)
    if (category) categoryName = category.name
  }

  const folderId = await getOrCreateFolderByPath(['Shop', categoryName, folderProduct.name])

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
    } catch {
      // A single image failing to relocate (provider hiccup, missing blob) must
      // not fail the whole save - the row keeps its current url and can be
      // re-filed on the next save.
    }
  }
}
