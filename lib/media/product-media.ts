import { prisma } from '@/lib/db/prisma'
import { cleanFolderName, getOrCreateFolderByPath, moveFolder, moveOrRenameMedia, sanitizeFolderSegment } from '@/lib/media/organise'
import { getProductById } from '@/modules/shop/lib/db/products'
import { getCategoryAncestorPath } from '@/modules/shop/lib/db/catalogue'

// ---------------------------------------------------------------------------
// Product image filing.
//
// Every image attached to a product is filed in the core media library under
//   shop / <master category trail> / <product> / <product-slug><n>
// (n is the image's 1-based position; the folder names are lower-cased to match
// the storage path, so images share a folder with the product's 3D models and
// downloads rather than a parallel upper-case one). The master category's whole
// ancestor trail names the folders - a product in a sub-category is filed inside
// its parent category's folder (shop / office-tables / meeting-boardroom-tables /
// <product>), not a flat folder named only for the leaf - and the product name
// names the folder inside it; products with no master land under "Uncategorised".
// Only images that resolve to a managed core
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
 * yet: shop / <master category trail> / <product> (names lower-cased to match the
 * storage path, so 3D models and downloads file alongside the images). The master
 * category's full ancestor trail is used, so a sub-category nests inside its
 * parent's folder rather than sitting in a flat folder of its own.
 *
 * `masterCategoryId` overrides the product's saved master, which is what lets
 * the editor file an upload under the category currently picked on screen
 * rather than the one last saved. `folderProductId` files under another
 * product's folder (see the header note).
 */
async function productFolderSegments(
  productId: string,
  options: { folderProductId?: string; masterCategoryId?: string | null } = {},
): Promise<string[] | null> {
  const folderProductId = options.folderProductId ?? productId
  const folderProduct = await getProductById(folderProductId)
  if (!folderProduct) return null

  const masterCategoryId = options.masterCategoryId !== undefined
    ? options.masterCategoryId
    : folderProduct.masterCategoryId

  // The master category's whole ancestor trail, root -> ... -> the master itself,
  // so a product in a sub-category is filed inside its parent category's folder
  // (shop / office-tables / meeting-boardroom-tables / <product>) rather than in a
  // flat folder named only for the leaf. A product with no master, or one whose
  // master has since been deleted, lands under "Uncategorised".
  let categorySegments: string[] = [UNCATEGORISED_FOLDER]
  if (masterCategoryId) {
    const trail = await getCategoryAncestorPath(masterCategoryId)
    if (trail.length > 0) categorySegments = trail.map((c) => c.name)
  }

  // The segments are lower-cased to the same form the storage path uses, so a
  // product's images land in the very folder its 3D models and downloads do -
  // those modules build their subfolder from this folder's resolved (lower-case)
  // path, and an upper-case tree here left images sitting in a parallel folder.
  return [
    sanitizeFolderSegment('Shop'),
    ...categorySegments.map((name) => sanitizeFolderSegment(name)),
    sanitizeFolderSegment(folderProduct.name),
  ]
}

export async function getProductMediaFolderId(
  productId: string,
  options: { folderProductId?: string; masterCategoryId?: string | null } = {},
): Promise<string | null> {
  const segments = await productFolderSegments(productId, options)
  if (segments === null) return null
  return getOrCreateFolderByPath(segments)
}

/**
 * The same walk as getProductMediaFolderId, but looking only - nothing is
 * created. Descends the product's folder path as far as it actually exists and
 * returns the deepest folder found, so a product with no uploads yet opens the
 * picker at its category (or Shop, or the root) rather than conjuring an empty
 * folder for every product whose picker was merely opened. Extra `segments` are
 * appended to the walk - the 3D module asks for [...path, '3d'].
 */
export async function findProductMediaFolderId(
  productId: string,
  options: { folderProductId?: string; masterCategoryId?: string | null; segments?: string[] } = {},
): Promise<string | null> {
  const base = await productFolderSegments(productId, options)
  if (base === null) return null

  // Mirror getOrCreateFolderByPath's treatment of each segment (cleaned, blanks
  // skipped) so the find walks exactly the tree the create would build.
  let parentId: string | null = null
  for (const raw of [...base, ...(options.segments ?? [])]) {
    const clean = cleanFolderName(raw)
    if (!clean) continue
    const existing: { id: string } | null = await prisma.folder.findFirst({ where: { parentId, name: clean }, select: { id: true } })
    if (!existing) break
    parentId = existing.id
  }
  return parentId
}

/** One rename in a renumber, in the order it has to happen. */
export type ImageRenameStep = {
  mediaId: string
  name: string
  /** Set on a parking step: the name this rename releases for somebody else. */
  frees?: string
}

/**
 * Order the renames a renumber needs so that no image is ever asked to take a
 * name one of its siblings is still using.
 *
 * Renumbering is a permutation, and renaming a permutation in place collides
 * with itself: reorder two pictures and the one now third asks for the name the
 * one now second still holds. The core relocate is told to 'replace' on a clash,
 * and replace supersedes and deletes what it finds - so an innocent reorder
 * would delete a picture that is still on the product, after overwriting its
 * blob. (An exact-name key is derived from the name, so taking the name takes
 * the storage key with it.)
 *
 * The fix is the one you'd use to renumber anything in place: park first. Any
 * image whose current name is on somebody else's wish list moves to a name no
 * image can ask for, and every target is free before a single one is claimed.
 * A parked image keeps serving - its references move with it - and gets its real
 * name in the second pass.
 *
 * Pure so the ordering can be tested without a database or a storage provider.
 */
export function planImageRenames(
  items: Array<{ mediaId: string; currentName: string | null; target: string }>,
  parkingName: (mediaId: string) => string,
): ImageRenameStep[] {
  const wanted = new Set(items.map((i) => i.target))
  const steps: ImageRenameStep[] = []

  for (const item of items) {
    if (!item.currentName || item.currentName === item.target) continue
    if (!wanted.has(item.currentName)) continue
    steps.push({ mediaId: item.mediaId, name: parkingName(item.mediaId), frees: item.currentName })
  }
  for (const item of items) steps.push({ mediaId: item.mediaId, name: item.target })

  return steps
}

/**
 * The folder a product's images currently sit in, read off an existing managed
 * image rather than rebuilt from the category path - by the time this runs the
 * save has already written the product's new category, so the old path can no
 * longer be reconstructed. Images are filed directly in the product folder (its
 * 3D models and downloads live in subfolders below), so an image's folder IS the
 * product folder. Null when the product has no managed image to read it from.
 */
async function currentProductFolderId(productId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ url: string }[]>`
    SELECT "url" FROM "shp_product_media"
    WHERE "product_id" = ${productId} AND "type" = 'IMAGE'
    ORDER BY "position" ASC
  `
  for (const { url } of rows) {
    const media = await prisma.media.findFirst({ where: { url }, select: { folderId: true } })
    if (media?.folderId) return media.folderId
  }
  return null
}

/**
 * Bring a product's existing media folder to the place its category tree now puts
 * it. When a product moves into (or out of) a sub-category its folder path gains
 * or loses a level; the folder keeps its name (the product's) and simply gains
 * its new parent. Moving the folder itself re-keys every descendant in one go -
 * the product's images, its 3D models and its downloads - and each module's
 * stored url follows automatically: the registered media-reference rewriters
 * repoint the image and variant tables, and the downloads route heals its own
 * copy from the media id on the next read.
 *
 * A no-op when the folder is already in the right place, when the product has no
 * folder yet (nothing filed), or when the destination already holds a folder of
 * this name - two products sharing a name. In that last case the per-image filing
 * still relocates the images one by one, and any 3D models or downloads are
 * re-filed on their next upload.
 */
async function relocateProductFolderIfMoved(
  productId: string,
  options: { folderProductId?: string; masterCategoryId?: string | null } = {},
): Promise<void> {
  const folderProductId = options.folderProductId ?? productId
  const folderProduct = await getProductById(folderProductId)
  if (!folderProduct) return

  const segments = await productFolderSegments(productId, options)
  if (segments === null) return
  const targetParentId = await getOrCreateFolderByPath(segments.slice(0, -1))
  if (targetParentId === null) return

  const currentId = await currentProductFolderId(folderProductId)
  if (currentId === null) return

  const folder = await prisma.folder.findUnique({ where: { id: currentId }, select: { parentId: true, name: true } })
  if (!folder) return
  if (folder.parentId === targetParentId) return // already in place

  // Only move a folder that is genuinely this product's own - its name is the
  // product's. Guards against relocating a shared or mis-read folder.
  if (folder.name !== cleanFolderName(sanitizeFolderSegment(folderProduct.name))) return

  try {
    await moveFolder(currentId, targetParentId)
  } catch (err) {
    // A name clash in the destination (another product of the same name already
    // there) or a provider hiccup must not fail the whole save - the per-image
    // filing below still relocates the images one by one as a fallback.
    console.warn(`[shop] could not relocate media folder for product ${productId}:`, err)
  }
}

export async function reorganiseProductMedia(
  productId: string,
  options: { folderProductId?: string } = {},
): Promise<void> {
  const product = await getProductById(productId)
  if (!product) return

  // Bring the product's whole media folder to its category's current home before
  // filing anything. When a product moves into or out of a sub-category the path
  // gains or loses a level, and a plain per-image move would relocate the pictures
  // while leaving the 3D models and downloads in the old, now-orphaned folder.
  // Moving the folder itself carries all three across together; the per-image
  // filing below then runs inside the folder's final home.
  await relocateProductFolderIfMoved(productId, options)

  // Images are normally filed under their own product; `folderProductId` files
  // them under another product's folder instead (see the header note).
  const folderId = await getProductMediaFolderId(productId, options)
  if (folderId === null) return

  const images = await prisma.$queryRaw<{ url: string }[]>`
    SELECT "url" FROM "shp_product_media"
    WHERE "product_id" = ${productId} AND "type" = 'IMAGE'
    ORDER BY "position" ASC
  `

  // Resolve every managed image to its Media row and the name it should end up
  // with. The index counts unmanaged entries too, so an externally-hosted url in
  // the middle of the list doesn't shift the numbering of the images around it.
  type Planned = { mediaId: string; url: string; currentName: string | null; target: string }
  const planned: Planned[] = []
  let index = 0
  for (const { url } of images) {
    index += 1
    const media = await prisma.media.findFirst({ where: { url }, select: { id: true, originalName: true } })
    if (!media) continue // externally-hosted or otherwise unmanaged - leave as-is
    planned.push({ mediaId: media.id, url, currentName: media.originalName, target: `${product.slug}${index}` })
  }

  const file = async (item: Planned, newName: string): Promise<boolean> => {
    try {
      const updated = await moveOrRenameMedia(item.mediaId, {
        targetFolderId: folderId,
        newName,
        exactName: true,
        collision: 'replace',
      })
      if (!updated) return false
      if (updated.url !== item.url) {
        await prisma.$executeRaw`
          UPDATE "shp_product_media" SET "url" = ${updated.url}
          WHERE "product_id" = ${productId} AND "url" = ${item.url}
        `
        item.url = updated.url
      }
      item.currentName = updated.originalName
      return true
    } catch (err) {
      // A single image failing to relocate (provider hiccup, missing blob) must
      // not fail the whole save - the row keeps its current url and can be
      // re-filed on the next save. Say so in the log though: swallowing this
      // silently is how every product image ended up sat in the library root
      // with nothing anywhere reporting a problem.
      console.warn(`[shop] could not file image ${item.url} for product ${productId}:`, err)
      return false
    }
  }

  const byId = new Map(planned.map((p) => [p.mediaId, p]))
  const unavailable = new Set<string>()

  for (const step of planImageRenames(planned, (id) => `${product.slug}-parking-${id}`)) {
    const item = byId.get(step.mediaId)
    if (!item) continue

    // The image sitting on this name could not be moved aside. Claiming it now
    // would delete that image, so leave this one where it is: it keeps its
    // current url, and the next save re-files it.
    if (!step.frees && unavailable.has(step.name)) {
      console.warn(`[shop] leaving image ${item.url} unfiled for product ${productId}: ${step.name} is still held`)
      continue
    }

    const ok = await file(item, step.name)
    if (!ok && step.frees) unavailable.add(step.frees)
  }
}
