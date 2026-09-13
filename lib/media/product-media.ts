import { prisma } from '@/lib/db/prisma'
import {
  cleanFolderName, findFolderByPath, getOrCreateFolderByPath, moveOrRenameMedia, rekeyFolderSubtree,
  relocateFolderInto, resolveFolderPath, sanitizeFolderSegment,
} from '@/lib/media/organise'
import { getProductById } from '@/modules/shop/lib/db/products'
import { getCategoryAncestorPath } from '@/modules/shop/lib/db/catalogue'
import {
  findFolderIdsByPath, formerImageFolderPaths, isListingDepthFolder, isUnclaimedListingFolder, lastListingToLeave,
  listingFolderPath, loadCategoryFolderPaths,
} from '@/modules/shop/lib/media/listing-folders'

// ---------------------------------------------------------------------------
// Product image filing.
//
// Every image attached to a product is filed in the core media library under
//   shop / <master category trail> / <product>
// (the folder names are lower-cased to match the storage path, so images share a
// folder with the product's 3D models and downloads rather than a parallel
// upper-case one). The master category's whole ancestor trail names the folders -
// a product in a sub-category is filed inside its parent category's folder
// (shop / office-tables / meeting-boardroom-tables / <product>), not a flat folder
// named only for the leaf - and the product name names the folder inside it;
// products with no master land under "Uncategorised". Only images that resolve to
// a managed core Media row are moved - externally-hosted urls and video embeds are
// left untouched. Runs on every product save, after the media list has been
// written, and is idempotent: an image already in the right folder is a no-op (no
// blob copy).
//
// The file KEEPS the name the person uploaded it under. This only organises
// images into the product's folder; it never renames them. (Product images were
// once renumbered to "<product-slug><n>" on every save, which is exactly the
// renaming this deliberately no longer does.)
//
// The per-product folder is what lets a product's variation images sit with its
// own: a dependent module (shop-variations) files a variant's image by passing
// the parent as `folderProductId`, so a variant's image lands under the parent
// rather than under "Uncategorised" - and passes `subfolder` so it lands one
// level down rather than in among the parent's own photographs. A big range puts
// a hundred variant pictures against three of the product's, and mixed together
// the folder is unreadable; a named subfolder is the same arrangement the 3D
// models, downloads and colour swatches already use.
//
// The exact-name flag on the core relocate keeps the stored key free of the
// usual nanoid, so the url reads shop/<category>/<product>/<uploaded-name>.<ext>
// - the same exact-name key a media-library upload into this folder already
// gets, which is what makes an editor upload a no-op here (the key it is already
// on is the key this would build). Two images that happen to share an uploaded
// name in one folder are kept apart with a numeric suffix, never overwritten.
//
// The editor also resolves this folder up front (getProductMediaFolderId) and
// uploads new images straight into it. Filing on save alone was not enough: an
// upload that is never saved, or saved while any part of the move fails, simply
// stayed in the library root, which is where product images had been piling up.
// ---------------------------------------------------------------------------

const UNCATEGORISED_FOLDER = 'Uncategorised'

/**
 * Where a product's pictures are filed.
 *
 * `subfolder` is a plain folder name, sanitised into a path segment here - a
 * module filing its own kind of picture under the product asks for its own
 * (shop-variations asks for "variations"). It never applies to the product folder
 * ITSELF, only to what is filed inside it, which is why the folder relocation
 * below deliberately resolves its path without one.
 */
type ProductFolderOptions = { folderProductId?: string; masterCategoryId?: string | null; subfolder?: string }

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
 * product's folder, and `subfolder` one level below that (see the header note).
 */
async function productFolderSegments(
  productId: string,
  options: ProductFolderOptions = {},
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
    // Blank unless a caller asked for one, and a blank segment is skipped by both
    // the create and the find walks - so the ordinary product path is untouched.
    ...(options.subfolder ? [sanitizeFolderSegment(options.subfolder)] : []),
  ]
}

export async function getProductMediaFolderId(
  productId: string,
  options: ProductFolderOptions = {},
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
  options: ProductFolderOptions & { segments?: string[] } = {},
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

/**
 * The folder a product's images currently sit in, read off an existing managed
 * image rather than rebuilt from the category path - by the time this runs the
 * save has already written the product's new category and name, so the old path
 * can no longer be reconstructed. Images are filed directly in the product folder
 * (its 3D models and downloads live in subfolders below), so an image's folder IS
 * the product folder. Null when the product has no managed image to read it from.
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

/** What a product was called, and filed under, before the save being filed now. */
export type PreviousProductFiling = { name: string; masterCategoryId: string | null }

export type ProductMediaFilingOptions = {
  /** File under this product's folder instead of the product's own (see the header note). */
  folderProductId?: string
  /** File one level below the product folder, in a folder of this name. */
  subfolder?: string
  /**
   * The name and master category the product had before this save. Lets a
   * product with no pictures of its own - only 3D models or downloads - still
   * have its folder found and carried across when it is renamed.
   */
  previous?: PreviousProductFiling
  /**
   * Also copy the files of a moved folder onto their new storage path, stopping
   * at this Date.now() timestamp. Omitted, a move is the folder rows only and the
   * files keep serving from their old addresses until a later pass copies them.
   */
  rekeyUntil?: number
}

/**
 * Bring a product's media folder to the place its name and category tree now put
 * it, and hand back the product folder's id (null when it has none yet).
 *
 * The folder is found from whichever of these is there, and every one that is
 * genuinely this product's is carried across, merging into the new folder when
 * one already exists:
 *   - the path its previous name and category built, when the caller knows them
 *     (a rename or a category move in the product editor);
 *   - the folder its pictures sit in now (a rename or move made by an import,
 *     which files nothing);
 *   - folders its pictures were moved OUT of, which is how a listing renamed
 *     before this carried whole folders was left with its pictures under the new
 *     name and its 3D models, downloads and variation pictures under the old one.
 *
 * A folder is only carried if it is at listing depth under a category and no
 * other catalogue listing is filed in it now (see listing-folders.ts), and one
 * found through its pictures' old addresses only if this product was the last to
 * move pictures out of it. Anything else stays put: carrying another listing's
 * folder would be far worse than leaving this one's where it is.
 *
 * Moving the folder carries every descendant - the product's images, its
 * variations' images, its 3D models, its downloads - and each module's stored url
 * follows when the files are copied, through the registered media-reference
 * rewriters.
 */
async function relocateProductFolder(
  productId: string,
  options: ProductMediaFilingOptions = {},
): Promise<string | null> {
  const folderProductId = options.folderProductId ?? productId
  const folderProduct = await getProductById(folderProductId)
  if (!folderProduct) return null

  // Without the subfolder: what moves is the PRODUCT's folder, and a caller filing
  // into a subfolder of it still wants the whole thing carried to its new home.
  const segments = await productFolderSegments(folderProductId)
  if (segments === null) return null
  const targetName = segments[segments.length - 1]
  if (!targetName) return null

  const categoryPaths = await loadCategoryFolderPaths()
  const targetPath = listingFolderPath(folderProduct.masterCategoryId, folderProduct.name, categoryPaths)
  // A product named exactly like one of its category's sub-categories is filed in
  // that sub-category's folder. Carrying a whole folder into it would bury the
  // listing's files among every product in the sub-category, so leave that to the
  // per-image filing, which is what it always did.
  if (!isListingDepthFolder(targetPath, categoryPaths)) return findFolderByPath(segments)

  // The folder the app itself files into - found by stored name, the way every
  // upload finds it - is where everything is carried to.
  let productFolderId = await findFolderByPath(segments)

  const candidates = new Map<string, { directory?: string }>()
  // Folders sharing the product folder's storage path under a name that differs
  // only past where the path cuts it off. Same path, same listing: nothing to
  // weigh up, they are simply folded into the one the app uses.
  candidates.set(targetPath, {})
  if (options.previous && folderProductId === productId) {
    candidates.set(listingFolderPath(options.previous.masterCategoryId, options.previous.name, categoryPaths), {})
  }
  const currentId = await currentProductFolderId(folderProductId)
  if (currentId) candidates.set(await resolveFolderPath(currentId), {})
  for (const former of await formerImageFolderPaths(folderProductId)) {
    if (!candidates.has(former.path)) candidates.set(former.path, { directory: former.directory })
  }

  let targetParentId: string | null | undefined
  for (const [path, { directory }] of candidates) {
    if (path !== targetPath) {
      if (!(await isUnclaimedListingFolder(path, folderProductId, categoryPaths))) continue
      if (directory !== undefined && (await lastListingToLeave(directory)) !== folderProductId) continue
    }

    for (const folderId of await findFolderIdsByPath(path)) {
      if (folderId === productFolderId) continue
      try {
        // Into the product folder when there is one (the parent walk below finds
        // the very folder it sits in), or renamed into place as the product folder
        // when there is not.
        targetParentId ??= await getOrCreateFolderByPath(segments.slice(0, -1))
        productFolderId = await relocateFolderInto(folderId, targetParentId, targetName)
      } catch (err) {
        // A provider hiccup on a colliding file, or corrupt folder data, must not
        // fail the whole save - the per-image filing below still relocates the
        // images one by one, and the tidy-up on the categories screen reports what
        // is left.
        console.warn(`[shop] could not carry media folder ${path} across for product ${productId}:`, err)
      }
    }
  }

  return productFolderId ?? findFolderByPath(segments)
}

/**
 * Copy the files under a product's folder onto the storage path the folder now
 * has, until `until` (a Date.now() timestamp). Run after a save has moved the
 * folder rows - see ProductMediaFilingOptions.rekeyUntil - and safe to run any
 * number of times: files already in place cost nothing. `remaining` is how many
 * it did not reach, each still serving from its old address.
 */
export async function finishProductMediaMove(productId: string, until: number): Promise<{ remaining: number }> {
  const segments = await productFolderSegments(productId)
  if (segments === null) return { remaining: 0 }
  const folderId = await findFolderByPath(segments)
  if (!folderId) return { remaining: 0 }
  const { remaining } = await rekeyFolderSubtree(folderId, { deadline: until })
  return { remaining }
}

export async function reorganiseProductMedia(
  productId: string,
  options: ProductMediaFilingOptions = {},
): Promise<{ remaining: number }> {
  const product = await getProductById(productId)
  if (!product) return { remaining: 0 }

  // Bring the product's whole media folder to its current home before filing
  // anything. A rename changes the folder's NAME and a category move its parent,
  // and a plain per-image move would relocate the pictures while leaving the
  // variations' pictures, the 3D models and the downloads in the old, now
  // orphaned folder - which is exactly what renaming a listing used to do.
  // Moving the folder itself carries all of it across together; the per-image
  // filing below then runs inside the folder's final home.
  const productFolderId = await relocateProductFolder(productId, options)

  // The folder rows have moved; the files follow onto their new storage path here
  // when the caller has time for it, and on a later pass when it has not.
  let remaining = 0
  if (options.rekeyUntil !== undefined && productFolderId) {
    remaining = (await rekeyFolderSubtree(productFolderId, { deadline: options.rekeyUntil })).remaining
  }

  // Images are normally filed under their own product; `folderProductId` files
  // them under another product's folder instead, and `subfolder` one level below
  // that (see the header note).
  const folderId = await getProductMediaFolderId(productId, options)
  if (folderId === null) return { remaining }

  const images = await prisma.$queryRaw<{ url: string }[]>`
    SELECT "url" FROM "shp_product_media"
    WHERE "product_id" = ${productId} AND "type" = 'IMAGE'
    ORDER BY "position" ASC
  `

  // A picture the FOLDER-OWNER listing also uses stays in the owner's own folder.
  // Dragging it into a subfolder sets two saves fighting over one blob - the
  // variant's save pulls it down into `variations`, the owner's next save pulls it
  // back up, and each tug is a real copy and delete at the storage provider. Not
  // hypothetical: 510 pictures on the catalogue this was written for sit on a
  // listing and on one of its own variants at the same time.
  const ownerUrls = new Set<string>()
  if (options.subfolder && options.folderProductId && options.folderProductId !== productId) {
    const owned = await prisma.$queryRaw<{ url: string }[]>`
      SELECT "url" FROM "shp_product_media"
      WHERE "product_id" = ${options.folderProductId} AND "type" = 'IMAGE'
    `
    for (const { url } of owned) ownerUrls.add(url)
  }

  // File each managed image into the product folder under the name it already
  // has - no rename, no renumber. An image the editor uploaded straight into the
  // folder is already on its exact-name key here, so moveOrRenameMedia sees no
  // change and does no blob work; only a straggler (picked from the library,
  // imported by CSV) is actually moved. 'suffix' rather than 'replace' on a name
  // clash: two images that happen to share an uploaded name in one folder are
  // kept apart, never overwritten.
  for (const { url } of images) {
    if (ownerUrls.has(url)) continue // shared with the listing itself - see above
    const media = await prisma.media.findFirst({ where: { url }, select: { id: true } })
    if (!media) continue // externally-hosted or otherwise unmanaged - leave as-is
    try {
      const updated = await moveOrRenameMedia(media.id, {
        targetFolderId: folderId,
        // No newName: the file keeps its uploaded name. This organises, never renames.
        exactName: true,
        collision: 'suffix',
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
  return { remaining }
}
