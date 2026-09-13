import { prisma } from '@/lib/db/prisma'
import { sanitizeFolderSegment } from '@/lib/media/organise'
import { reorganiseProductMedia } from '@/modules/shop/lib/media/product-media'
import {
  folderPathOfKeyDirectory, folderPathSegment, isListingDepthFolder, listingFolderPath, loadCategoryFolderPaths,
  splitFolderPath,
} from '@/modules/shop/lib/media/listing-folders'

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
  /** Where its files sit now (the location holding most of the strays). */
  currentPath: string
  /** Where they belong. */
  targetPath: string
  fileCount: number
}

/** Every folder's storage path, root first, built from the Folder tree in one query. */
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
 * and name imply. `categoryId` narrows the report to one category's own products
 * (used straight after a rename); omitted, the whole catalogue is checked.
 *
 * Three ways a listing's files end up in the wrong place, and all three count:
 *   - its pictures sit in another folder (an import renamed or re-categorised it,
 *     and imports file nothing);
 *   - its folder is in the right place but some files under it are still on the
 *     old storage path (a move whose copying was cut off, or has not run yet);
 *   - a folder it was renamed out of still holds its 3D models, downloads or
 *     variation pictures (a rename made before a rename carried whole folders).
 *
 * Catalogue-hidden products are skipped. A dependent module may file a hidden
 * product's media under another listing's folder on purpose - shop-variations
 * does exactly that, so every variation in the shop would otherwise be reported
 * as drifted against a folder it was never meant to be in. Shop has no business
 * reading that module's tables to tell the two apart, and a hidden product is
 * not one the owner is looking at in the library anyway.
 */
export async function findMediaDrift(categoryId?: string): Promise<DriftedProduct[]> {
  const [paths, categoryPaths] = await Promise.all([folderPaths(), loadCategoryFolderPaths()])
  const folderIdByPath = new Map([...paths].map(([id, path]) => [path, id]))

  const listings = await prisma.$queryRaw<{ id: string; name: string; masterCategoryId: string | null }[]>`
    SELECT p."id", p."name", p."master_category_id" AS "masterCategoryId"
    FROM "shp_products" p
    WHERE p."catalogue_hidden" IS NOT TRUE
  `
  const targetOf = new Map(listings.map((l) => [l.id, listingFolderPath(l.masterCategoryId, l.name, categoryPaths)]))
  const listingAt = new Map([...targetOf].map(([id, path]) => [path, id]))

  // productId -> location -> files there that should not be
  const strays = new Map<string, Map<string, number>>()
  const addStrays = (productId: string, location: string, n: number) => {
    const byLocation = strays.get(productId) ?? new Map<string, number>()
    byLocation.set(location, (byLocation.get(location) ?? 0) + n)
    strays.set(productId, byLocation)
  }

  // 1. Pictures in the wrong folder. Only the files this listing actually owns,
  // counted through its own media rows. A picture two listings share and that sits
  // in one of THEIR folders is filed correctly for that one, so it is not reported
  // against the other: moving it would only unfile it for the first, and the
  // report could never be cleared.
  const owned = await prisma.$queryRaw<{ productId: string; mediaId: string; folderId: string | null }[]>`
    SELECT DISTINCT pm."product_id" AS "productId", m."id" AS "mediaId", m."folderId" AS "folderId"
    FROM "shp_product_media" pm
    JOIN "shp_products" p ON p."id" = pm."product_id" AND p."catalogue_hidden" IS NOT TRUE
    JOIN "Media" m ON m."url" = pm."url"
  `
  const homesOf = new Map<string, Set<string>>()
  for (const row of owned) {
    const target = targetOf.get(row.productId)
    if (!target) continue
    const homes = homesOf.get(row.mediaId) ?? new Set<string>()
    homes.add(target)
    homesOf.set(row.mediaId, homes)
  }
  for (const row of owned) {
    const location = (row.folderId ? paths.get(row.folderId) : '') ?? ''
    if (homesOf.get(row.mediaId)?.has(location)) continue
    addStrays(row.productId, location || '(library root)', 1)
  }

  // Everything under the shop's folder, grouped by folder and by the directory
  // its key actually sits in - a handful of rows per folder, not one per file.
  const shopRoot = folderPathSegment('Shop')
  const shopFolderIds = [...paths].filter(([, path]) => path === shopRoot || path.startsWith(`${shopRoot}/`)).map(([id]) => id)
  const filed = shopFolderIds.length === 0 ? [] : await prisma.$queryRaw<{
    folderId: string; provider: string; directory: string; n: bigint
  }[]>`
    SELECT m."folderId" AS "folderId", m."provider"::text AS "provider",
      left(m."key", length(m."key") - strpos(reverse(m."key"), '/')) AS "directory", count(*) AS n
    FROM "Media" m
    WHERE m."folderId" = ANY(${shopFolderIds}::text[])
    GROUP BY 1, 2, 3
  `

  // The listing a folder path belongs to: its own folder or anything under it.
  const listingFor = (path: string): string | undefined => {
    for (let p = path; p; p = splitFolderPath(p).parent) {
      const id = listingAt.get(p)
      if (id) return id
    }
    return undefined
  }

  // 2. Files under a listing's folder still on an old storage path.
  const filesUnder = new Map<string, number>()
  for (const row of filed) {
    const path = paths.get(row.folderId) ?? ''
    for (let p = path; p; p = splitFolderPath(p).parent) filesUnder.set(p, (filesUnder.get(p) ?? 0) + Number(row.n))
    const keyPath = folderPathOfKeyDirectory(row.directory, row.provider)
    if (keyPath === null || keyPath === path) continue
    const productId = listingFor(path)
    if (productId) addStrays(productId, keyPath, Number(row.n))
  }

  // 3. Folders left behind by a rename: at listing depth, filed under by no
  // listing, still holding files, and last moved out of by a catalogue listing.
  const leftBehind = [...filesUnder.keys()].filter(
    (path) => !listingAt.has(path) && isListingDepthFolder(path, categoryPaths),
  )
  if (leftBehind.length > 0) {
    const departures = await prisma.$queryRaw<{ directory: string; provider: string; productId: string }[]>`
      SELECT DISTINCT ON ("directory") "directory", "provider", "productId" FROM (
        SELECT left(fa."key", length(fa."key") - strpos(reverse(fa."key"), '/')) AS "directory",
          m."provider"::text AS "provider", pm."product_id" AS "productId", fa."createdAt", m."key" AS "currentKey"
        FROM "MediaFormerAddress" fa
        JOIN "Media" m ON m."id" = fa."mediaId"
        JOIN "shp_product_media" pm ON pm."url" = m."url" AND pm."type" = 'IMAGE'
        JOIN "shp_products" p ON p."id" = pm."product_id" AND p."catalogue_hidden" IS NOT TRUE
      ) moves
      WHERE NOT starts_with("currentKey", "directory" || '/')
      ORDER BY "directory", "createdAt" DESC
    `
    const leaverAt = new Map<string, string>()
    for (const row of departures) {
      const path = folderPathOfKeyDirectory(row.directory, row.provider)
      if (path) leaverAt.set(path, row.productId)
    }
    for (const path of leftBehind) {
      const productId = leaverAt.get(path)
      if (productId && folderIdByPath.has(path)) addStrays(productId, path, filesUnder.get(path) ?? 0)
    }
  }

  const drifted: DriftedProduct[] = []
  for (const listing of listings) {
    if (categoryId && listing.masterCategoryId !== categoryId) continue
    const byLocation = strays.get(listing.id)
    if (!byLocation) continue
    // The location holding most of the strays names the "current" path in the
    // report - a listing whose files ended up spread over two old folders is
    // still one line, described by where the bulk of it sits.
    const [worst] = [...byLocation].sort((a, b) => b[1] - a[1])
    drifted.push({
      productId: listing.id,
      name: listing.name,
      currentPath: worst?.[0] ?? '(library root)',
      targetPath: targetOf.get(listing.id) ?? '',
      fileCount: [...byLocation.values()].reduce((sum, n) => sum + n, 0),
    })
  }
  return drifted
}

/**
 * Re-file each listing in turn, reporting what happened rather than throwing:
 * one product with a missing blob must not stop the rest of a tidy-up.
 *
 * Every move goes through reorganiseProductMedia - the same call a product save
 * makes - so the media reference rewriters run and no url is left behind. Copying
 * stops starting new files at `until`; a listing it did not finish is reported in
 * `unfinished` and simply picked up where it left off by the next request.
 */
export async function refileProducts(
  productIds: string[],
  until: number,
): Promise<{ refiled: string[]; failed: string[]; unfinished: string[] }> {
  const refiled: string[] = []
  const failed: string[] = []
  const unfinished: string[] = []
  for (const id of productIds) {
    if (Date.now() >= until) {
      unfinished.push(id)
      continue
    }
    try {
      const { remaining } = await reorganiseProductMedia(id, { rekeyUntil: until })
      if (remaining > 0) unfinished.push(id)
      else refiled.push(id)
    } catch (err) {
      console.warn(`[shop] could not re-file media for product ${id}:`, err)
      failed.push(id)
    }
  }
  return { refiled, failed, unfinished }
}
