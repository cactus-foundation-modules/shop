import { prisma } from '@/lib/db/prisma'
import { cleanFolderName, getOrCreateFolderByPath, moveOrRenameMedia, sanitizeFolderSegment } from '@/lib/media/organise'
import { getCategoryById, getCategoryAncestorPath } from '@/modules/shop/lib/db/catalogue'

// ---------------------------------------------------------------------------
// Category picture filing.
//
// A category's own picture belongs in the library beside the products filed
// under it: shop / <the category's ancestor trail> - the very folder that holds
// each of its products' folders. Until now it went wherever the picker happened
// to be pointing, which was the library root, so category pictures piled up
// there mixed in with everything else while every product image was neatly
// filed.
//
// Same rules as product image filing (lib/media/product-media.ts), for the same
// reasons: segments are lower-cased through sanitizeFolderSegment so the folder
// IS the storage path rather than a parallel capitalised one; the file keeps the
// name it was uploaded under (this organises, it never renames); the exact-name
// key keeps the url reading shop/<category trail>/<uploaded-name>.<ext>, which is
// also the key a library upload into that folder already gets, so filing an
// upload the editor made there is a no-op with no blob work; and a name clash in
// the folder is suffixed, never overwritten.
//
// Filed twice over, as products are: the editor resolves the folder up front and
// uploads straight into it, and the save files whatever is stored afterwards.
// Neither alone is enough - an upload that is never saved would sit in the root,
// and a picture picked out of the library (rather than uploaded) never passes
// through the upload path at all.
// ---------------------------------------------------------------------------

/**
 * The library folder segments for a category: shop / <ancestor trail>, root
 * first, so a sub-category nests inside its parent exactly as its products do.
 *
 * `name` and `parentId` override what is saved, which is what lets the editor
 * file a picture under the name and parent currently on screen rather than the
 * ones last saved. Null for `parentId` means the top level.
 */
async function categoryFolderSegments(
  categoryId: string,
  options: { name?: string; parentId?: string | null } = {},
): Promise<string[] | null> {
  const category = await getCategoryById(categoryId)
  if (!category) return null

  const parentId = options.parentId !== undefined ? options.parentId : category.parentId
  const name = options.name?.trim() || category.name

  // The parent's whole trail, root -> ... -> the parent itself, with this
  // category's own name on the end. A top-level category is simply shop / <name>.
  const ancestors = parentId ? await getCategoryAncestorPath(parentId) : []

  return [
    sanitizeFolderSegment('Shop'),
    ...ancestors.map((c) => sanitizeFolderSegment(c.name)),
    sanitizeFolderSegment(name),
  ]
}

/** The category's folder, created if it does not exist yet. */
export async function getCategoryMediaFolderId(
  categoryId: string,
  options: { name?: string; parentId?: string | null } = {},
): Promise<string | null> {
  const segments = await categoryFolderSegments(categoryId, options)
  if (segments === null) return null
  return getOrCreateFolderByPath(segments)
}

/**
 * The same walk, looking only - nothing is created. Returns the deepest folder of
 * the path that already exists (the category's own, else an ancestor's, else
 * Shop, else null for the root), so opening the picker on a category that has no
 * pictures yet leaves no empty folder behind. Mirrors findProductMediaFolderId.
 */
export async function findCategoryMediaFolderId(
  categoryId: string,
  options: { name?: string; parentId?: string | null } = {},
): Promise<string | null> {
  const segments = await categoryFolderSegments(categoryId, options)
  if (segments === null) return null

  // Mirror getOrCreateFolderByPath's treatment of each segment (cleaned, blanks
  // skipped) so the find walks exactly the tree the create would build.
  let parentId: string | null = null
  for (const raw of segments) {
    const clean = cleanFolderName(raw)
    if (!clean) continue
    const existing: { id: string } | null = await prisma.folder.findFirst({ where: { parentId, name: clean }, select: { id: true } })
    if (!existing) break
    parentId = existing.id
  }
  return parentId
}

/**
 * File a category's saved picture into the category's folder, keeping
 * shp_categories.image_url pointing at it after the move.
 *
 * A no-op unless the url resolves to a managed core Media row - an externally
 * hosted picture has nothing to move, and the Media lookup coming first means the
 * folder is never created for a category with no picture at all. Run after
 * anything that changes where the category lives: its own save (rename,
 * re-parent, new picture) and a drag that re-parents it.
 *
 * Best-effort: a filing failure warns and leaves the url as it stands rather than
 * failing the save. Silently swallowing it is how product images ended up sat in
 * the root with nothing anywhere reporting a problem.
 */
export async function fileCategoryImage(categoryId: string): Promise<void> {
  const category = await getCategoryById(categoryId)
  if (!category?.imageUrl) return

  const media = await prisma.media.findFirst({ where: { url: category.imageUrl }, select: { id: true } })
  if (!media) return // externally hosted or otherwise unmanaged - leave as-is

  const folderId = await getCategoryMediaFolderId(categoryId)
  if (folderId === null) return

  try {
    const updated = await moveOrRenameMedia(media.id, {
      targetFolderId: folderId,
      // No newName: the file keeps its uploaded name. This organises, never renames.
      exactName: true,
      collision: 'suffix',
    })
    // The registered media-reference rewriter already repoints image_url when a
    // move rewrites the url; writing it here as well costs one statement and
    // keeps the filing correct on its own terms rather than by side effect.
    if (updated && updated.url !== category.imageUrl) {
      await prisma.$executeRaw`
        UPDATE "shp_categories" SET "image_url" = ${updated.url} WHERE "id" = ${categoryId}
      `
    }
  } catch (err) {
    console.warn(`[shop] could not file the picture for category ${categoryId}:`, err)
  }
}
