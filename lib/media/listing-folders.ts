import { prisma } from '@/lib/db/prisma'
import { sanitizeFolderSegment } from '@/lib/media/organise'
import { keyDirectory } from '@/lib/media/keys'

// ---------------------------------------------------------------------------
// Which folder in the media library is a listing's own.
//
// A listing's files live under shop / <master category trail> / <listing name>,
// and every segment of that is a NAME. Renaming a listing, or moving it to another
// category, changes where its files belong without touching where they are, so
// putting it right means carrying a whole folder somewhere else - its pictures,
// its variations' pictures, its 3D models, its downloads, all at once.
//
// The one thing that must never happen on the way is carrying the WRONG folder: a
// category's, the upload landing folder, or a different listing's. So a folder
// only counts as a listing's own if it sits exactly one level below a category's
// folder (or Uncategorised) and no other listing on the catalogue is filed in it
// now. This file is the arithmetic for that, done from one read of the category
// tree rather than a folder walk per file.
// ---------------------------------------------------------------------------

const SHOP_FOLDER = 'Shop'
const UNCATEGORISED_FOLDER = 'Uncategorised'

/**
 * The segment a folder named after `name` adds to a storage path.
 *
 * Not simply sanitizeFolderSegment(name). The folder is CREATED under the
 * sanitised name, and the storage path is then built by sanitising the folder's
 * name a second time. The two differ when the 60-character cut lands just after
 * a hyphen: the folder keeps the trailing hyphen, the path drops it. Comparing
 * against a single pass reported every listing with a name that long as misfiled,
 * however many times it was tidied.
 */
export function folderPathSegment(name: string): string {
  return sanitizeFolderSegment(sanitizeFolderSegment(name)) || 'folder'
}

export type CategoryNode = { id: string; name: string; parentId: string | null }

/**
 * The storage path of every category's folder, keyed by category id - shop /
 * <ancestor> / ... / <category>. A parent that no longer exists ends the trail,
 * the same place getCategoryAncestorPath's walk stops.
 */
export function categoryFolderPaths(categories: CategoryNode[]): Map<string, string> {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const paths = new Map<string, string>()
  const shop = folderPathSegment(SHOP_FOLDER)

  const pathOf = (id: string, seen: Set<string>): string => {
    const known = paths.get(id)
    if (known !== undefined) return known
    const category = byId.get(id)
    if (!category) return shop
    // A cycle in the tree is corrupt data; stop where it closes rather than loop.
    const parent = category.parentId && byId.has(category.parentId) && !seen.has(category.parentId)
      ? pathOf(category.parentId, new Set(seen).add(id))
      : shop
    const path = `${parent}/${folderPathSegment(category.name)}`
    paths.set(id, path)
    return path
  }

  for (const category of categories) pathOf(category.id, new Set())
  return paths
}

/** The folder path listings with no (surviving) master category are filed under. */
export function uncategorisedFolderPath(): string {
  return `${folderPathSegment(SHOP_FOLDER)}/${folderPathSegment(UNCATEGORISED_FOLDER)}`
}

/** Where a listing's files belong: shop / <category trail> / <listing name>. */
export function listingFolderPath(
  masterCategoryId: string | null,
  name: string,
  categoryPaths: Map<string, string>,
): string {
  const parent = (masterCategoryId ? categoryPaths.get(masterCategoryId) : undefined) ?? uncategorisedFolderPath()
  return `${parent}/${folderPathSegment(name)}`
}

/** The parent path and last segment of a folder path. */
export function splitFolderPath(path: string): { parent: string; leaf: string } {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? { parent: '', leaf: path } : { parent: path.slice(0, slash), leaf: path.slice(slash + 1) }
}

/**
 * The folder path a stored key is filed under, or null when the key does not sit
 * in that provider's key space at all (a direct provider's minted id, or a key
 * from some other scheme).
 */
export function folderPathOfKeyDirectory(directory: string, provider: string): string | null {
  const prefix = keyDirectory(provider)
  if (directory === prefix) return ''
  return directory.startsWith(`${prefix}/`) ? directory.slice(prefix.length + 1) : null
}

/**
 * Whether a folder path is where a listing's own folder would sit: directly
 * inside a category's folder, or inside Uncategorised - and not itself a
 * category's folder. That last half matters as much as the first. A sub-category
 * sits one level below its parent category exactly as a listing does, and
 * mistaking one for a listing's folder would carry every product filed in it
 * into a single listing.
 */
export function isListingDepthFolder(path: string, categoryPaths: Map<string, string>): boolean {
  const { parent, leaf } = splitFolderPath(path)
  if (!parent || !leaf) return false
  const categories = new Set(categoryPaths.values())
  if (categories.has(path) || path === uncategorisedFolderPath()) return false
  return categories.has(parent) || parent === uncategorisedFolderPath()
}

/** Every category's folder path, from one read of the category table. */
export async function loadCategoryFolderPaths(): Promise<Map<string, string>> {
  const rows = await prisma.$queryRaw<CategoryNode[]>`
    SELECT "id", "name", "parent_id" AS "parentId" FROM "shp_categories"
  `
  return categoryFolderPaths(rows)
}

/**
 * Every folder at a storage path, found by comparing each level's children on
 * their path segment rather than their stored name - the two differ for exactly
 * the long names folderPathSegment describes. Usually one folder or none; more
 * than one when folders were made with names that only differ past the point the
 * path cuts them off, which leaves two folders in the library sharing one storage
 * path and the files split between them. Creates nothing.
 */
export async function findFolderIdsByPath(path: string): Promise<string[]> {
  if (!path) return []
  let level: (string | null)[] = [null]
  for (const segment of path.split('/')) {
    const children: { id: string; name: string; parentId: string | null }[] = await prisma.folder.findMany({
      where: { OR: level.map((parentId) => ({ parentId })) },
      select: { id: true, name: true, parentId: true },
    })
    level = children.filter((child) => (sanitizeFolderSegment(child.name) || 'folder') === segment).map((c) => c.id)
    if (level.length === 0) return []
  }
  return level.filter((id): id is string => id !== null)
}

/**
 * Whether the folder at `path` is somewhere a listing's own files are filed, and
 * one no OTHER catalogue listing is filed in now - so it is safe to carry across
 * to `productId`'s current home.
 *
 * Catalogue-hidden products are not counted as claimants: shop-variations files
 * a variation's pictures under its listing's folder on purpose, so a hidden row
 * living in there is expected, not a rival.
 */
export async function isUnclaimedListingFolder(
  path: string,
  productId: string,
  categoryPaths: Map<string, string>,
): Promise<boolean> {
  if (!isListingDepthFolder(path, categoryPaths)) return false
  const { parent, leaf } = splitFolderPath(path)

  const categoryIds = [...categoryPaths].filter(([, p]) => p === parent).map(([id]) => id)
  const uncategorised = parent === uncategorisedFolderPath()
  if (categoryIds.length === 0 && !uncategorised) return false

  const rivals = await prisma.$queryRaw<{ name: string }[]>`
    SELECT p."name" FROM "shp_products" p
    WHERE p."catalogue_hidden" IS NOT TRUE
      AND p."id" <> ${productId}
      AND (
        p."master_category_id" = ANY(${categoryIds}::text[])
        OR (${uncategorised} AND (
          p."master_category_id" IS NULL
          OR NOT EXISTS (SELECT 1 FROM "shp_categories" c WHERE c."id" = p."master_category_id")
        ))
      )
  `
  return !rivals.some((rival) => folderPathSegment(rival.name) === leaf)
}

/**
 * The catalogue listing whose pictures most recently moved out of the storage
 * directory `directory` (a key directory, provider prefix included) and are not
 * back in it, or null.
 *
 * This is how a folder left behind by a rename is told apart from one that merely
 * once held a picture a listing now uses. A listing duplicated from another starts
 * out on the original's pictures and moves them into its own folder on its first
 * save; the original, renamed later, moves its own out later still. The most
 * recent departure is the rename.
 */
export async function lastListingToLeave(directory: string): Promise<string | null> {
  const prefix = `${directory}/`
  const rows = await prisma.$queryRaw<{ productId: string }[]>`
    SELECT pm."product_id" AS "productId"
    FROM "MediaFormerAddress" fa
    JOIN "Media" m ON m."id" = fa."mediaId"
    JOIN "shp_product_media" pm ON pm."url" = m."url" AND pm."type" = 'IMAGE'
    JOIN "shp_products" p ON p."id" = pm."product_id" AND p."catalogue_hidden" IS NOT TRUE
    WHERE starts_with(fa."key", ${prefix})
      AND strpos(substr(fa."key", ${prefix.length + 1}::int), '/') = 0
      AND NOT starts_with(m."key", ${prefix})
    ORDER BY fa."createdAt" DESC
    LIMIT 1
  `
  return rows[0]?.productId ?? null
}

/**
 * Every storage directory a listing's pictures were filed in before they last
 * moved, as folder paths. Where a rename that filed the pictures under the new
 * name left the listing's other files behind, this is the only record of the old
 * folder that survives - the name it was built from is gone.
 */
export async function formerImageFolderPaths(productId: string): Promise<{ path: string; directory: string }[]> {
  const rows = await prisma.$queryRaw<{ directory: string; provider: string }[]>`
    SELECT DISTINCT
      left(fa."key", length(fa."key") - strpos(reverse(fa."key"), '/')) AS "directory",
      m."provider"::text AS "provider"
    FROM "shp_product_media" pm
    JOIN "Media" m ON m."url" = pm."url"
    JOIN "MediaFormerAddress" fa ON fa."mediaId" = m."id"
    WHERE pm."product_id" = ${productId} AND pm."type" = 'IMAGE'
      AND strpos(fa."key", '/') > 0
  `
  const out: { path: string; directory: string }[] = []
  for (const row of rows) {
    const path = folderPathOfKeyDirectory(row.directory, row.provider)
    if (path) out.push({ path, directory: row.directory })
  }
  return out
}
