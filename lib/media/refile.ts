import { prisma } from '@/lib/db/prisma'
import { sanitizeFolderSegment } from '@/lib/media/organise'
import { getCategoryAncestorPath } from '@/modules/shop/lib/db/catalogue'
import { reorganiseProductMedia } from '@/modules/shop/lib/media/product-media'

// ---------------------------------------------------------------------------
// Media filing drift.
//
// A product's images, models and downloads are filed under
//   shop / <master category trail> / <product>
// and that path is stamped when a file is written, never re-derived. Product
// saves re-file (reorganiseProductMedia), so a product that moves category
// catches up on its next save - but nothing at all happens when a CATEGORY is
// renamed or moved, and a category rename changes the path of every product
// under it.
//
// Left alone that drifts for as long as the shop lives: renaming "Office
// Seating" to "Office Chairs" left tens of thousands of files sitting under the
// old name, so the media library showed both spellings of the same category with
// the pictures split between them.
//
// So: the category editor re-files what it has just renamed (see the category
// route), and anything a rename could not finish is reported here and can be put
// right from the catalogue screen. Nothing is silently left behind.
// ---------------------------------------------------------------------------

/** A listing whose files are not where its current category and name imply. */
export type DriftedProduct = {
  productId: string
  name: string
  /** Where its files sit now (the deepest folder holding any of them). */
  currentPath: string
  /** Where they belong. */
  targetPath: string
  fileCount: number
}

const UNCATEGORISED_FOLDER = 'Uncategorised'

/**
 * The folder path a product's files belong under, as a slash-joined string of
 * the same sanitised segments productFolderSegments builds. Kept as text so a
 * whole catalogue can be checked in two queries rather than a folder walk each.
 */
async function targetPathFor(
  masterCategoryId: string | null,
  productName: string,
): Promise<string> {
  let segments = [UNCATEGORISED_FOLDER]
  if (masterCategoryId) {
    const trail = await getCategoryAncestorPath(masterCategoryId)
    if (trail.length > 0) segments = trail.map((c) => c.name)
  }
  return [sanitizeFolderSegment('Shop'), ...segments.map(sanitizeFolderSegment), sanitizeFolderSegment(productName)]
    .join('/')
}

/** Path of a folder, root first, built from the Folder tree in one query. */
async function folderPaths(): Promise<Map<string, string>> {
  const folders = await prisma.folder.findMany({ select: { id: true, name: true, parentId: true } })
  const byId = new Map(folders.map((f) => [f.id, f]))
  const paths = new Map<string, string>()
  for (const f of folders) {
    const segments: string[] = []
    let cursor: typeof f | undefined = f
    for (let depth = 0; cursor && depth < 20; depth++) {
      segments.unshift(sanitizeFolderSegment(cursor.name) || 'folder')
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
    }
    paths.set(f.id, segments.join('/'))
  }
  return paths
}

/**
 * Every listing whose media is filed somewhere other than its current category
 * and name imply. `categoryId` narrows the check to one category's own products
 * (used straight after a rename); omitted, the whole catalogue is checked.
 *
 * Catalogue-hidden products are skipped. A dependent module may file a hidden
 * product's media under another listing's folder on purpose - shop-variations
 * does exactly that, so every variation in the shop would otherwise be reported
 * as drifted against a folder it was never meant to be in. Shop has no business
 * reading that module's tables to tell the two apart, and a hidden product is
 * not one the owner is looking at in the library anyway.
 */
export async function findMediaDrift(categoryId?: string): Promise<DriftedProduct[]> {
  const paths = await folderPaths()

  const products = await prisma.$queryRaw<
    { id: string; name: string; masterCategoryId: string | null }[]
  >`
    SELECT p."id", p."name", p."master_category_id" AS "masterCategoryId"
    FROM "shp_products" p
    WHERE p."catalogue_hidden" IS NOT TRUE
      AND (${categoryId ?? null}::text IS NULL OR p."master_category_id" = ${categoryId ?? null}::text)
  `

  const drifted: DriftedProduct[] = []
  for (const product of products) {
    const target = await targetPathFor(product.masterCategoryId, product.name)
    // Only the files this listing actually owns - counted through its own media
    // rows, so a listing sharing a photograph with another is not dragged into
    // the report by it.
    const rows = await prisma.$queryRaw<{ folderId: string | null; n: bigint }[]>`
      SELECT m."folderId" AS "folderId", count(*) AS n
      FROM "shp_product_media" pm
      JOIN "Media" m ON m."url" = pm."url"
      WHERE pm."product_id" = ${product.id}
      GROUP BY m."folderId"
    `
    if (rows.length === 0) continue
    const wrong = rows.filter((r) => (r.folderId ? paths.get(r.folderId) : '') !== target)
    if (wrong.length === 0) continue
    // The folder holding most of the strays names the "current" path in the
    // report - a listing whose files ended up spread over two old folders is
    // still one line, described by where the bulk of it sits.
    const [worst] = wrong.sort((a, b) => Number(b.n) - Number(a.n))
    drifted.push({
      productId: product.id,
      name: product.name,
      currentPath: (worst?.folderId ? paths.get(worst.folderId) : '') || '(library root)',
      targetPath: target,
      fileCount: wrong.reduce((sum, r) => sum + Number(r.n), 0),
    })
  }
  return drifted
}

/**
 * Re-file each listing in turn, reporting what happened rather than throwing:
 * one product with a missing blob must not stop the rest of a tidy-up.
 *
 * Every move goes through reorganiseProductMedia - the same call a product save
 * makes - so the media reference rewriters run and no url is left behind.
 */
export async function refileProducts(productIds: string[]): Promise<{ refiled: string[]; failed: string[] }> {
  const refiled: string[] = []
  const failed: string[] = []
  for (const id of productIds) {
    try {
      await reorganiseProductMedia(id)
      refiled.push(id)
    } catch (err) {
      console.warn(`[shop] could not re-file media for product ${id}:`, err)
      failed.push(id)
    }
  }
  return { refiled, failed }
}
