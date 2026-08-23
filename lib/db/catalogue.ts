import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { PuckData, ShpCategory, ShpTag, ShpTagAutoRule, ShpCollection } from '@/modules/shop/lib/types'

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function mapCategory(r: Record<string, unknown>): ShpCategory {
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    description: (r.description as string | null) ?? null,
    shortDescription: (r.short_description as string | null) ?? null,
    // Absent from the listCategories projection on purpose - see below.
    descriptionPuck: (r.description_puck as PuckData | null) ?? null,
    imageUrl: (r.image_url as string | null) ?? null,
    parentId: (r.parent_id as string | null) ?? null,
    position: r.position as number,
    productDisplayMode: (r.product_display_mode as 'rollup' | 'exact' | null) ?? null,
    metaTitle: (r.meta_title as string | null) ?? null,
    metaDescription: (r.meta_description as string | null) ?? null,
    ogImageId: (r.og_image_id as string | null) ?? null,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

// Every column except description_puck. A designed description is a whole
// builder document, and the surfaces that list categories (the admin tree, the
// category-card tiles, the public categories API) never render one - they link
// to it or show the short blurb. Selecting it here would pull every category's
// document on every listing. Rows therefore come back with descriptionPuck null;
// fetch the single category by id/slug when the document itself is wanted.
const CATEGORY_LIST_COLUMNS = Prisma.sql`
  "id", "name", "slug", "description", "short_description", "image_url",
  "parent_id", "position", "product_display_mode",
  "meta_title", "meta_description", "og_image_id", "created_at", "updated_at"
`

// True when this category has a designed description saved, so the admin can
// show which categories have one without fetching any of the documents.
export type ShpCategoryListRow = ShpCategory & { hasDesignedDescription: boolean }

export async function listCategories(): Promise<ShpCategoryListRow[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT ${CATEGORY_LIST_COLUMNS}, ("description_puck" IS NOT NULL) AS has_designed_description
    FROM "shp_categories"
    ORDER BY "position" ASC, "name" ASC
  `
  return rows.map((r) => ({ ...mapCategory(r), hasDesignedDescription: r.has_designed_description === true }))
}

export async function getCategoryById(id: string): Promise<ShpCategory | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_categories" WHERE "id" = ${id} LIMIT 1`
  return rows[0] ? mapCategory(rows[0]) : null
}

export async function getCategoryBySlug(slug: string): Promise<ShpCategory | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_categories" WHERE "slug" = ${slug} LIMIT 1`
  return rows[0] ? mapCategory(rows[0]) : null
}

export async function createCategory(data: {
  name: string; slug: string; description?: string | null; shortDescription?: string | null
  imageUrl?: string | null; parentId?: string | null
  productDisplayMode?: 'rollup' | 'exact' | null
}): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_categories" ("name", "slug", "description", "short_description", "image_url", "parent_id", "product_display_mode")
    VALUES (
      ${data.name}, ${data.slug}, ${data.description ?? null}, ${data.shortDescription ?? null},
      ${data.imageUrl ?? null}, ${data.parentId ?? null}, ${data.productDisplayMode ?? null}
    )
    RETURNING "id"
  `
  return rows[0]
}

export async function updateCategory(id: string, fields: Partial<{
  name: string; slug: string; description: string | null; parentId: string | null; position: number
  shortDescription: string | null; descriptionPuck: PuckData | null; imageUrl: string | null
  productDisplayMode: 'rollup' | 'exact' | null
  metaTitle: string | null; metaDescription: string | null; ogImageId: string | null
}>): Promise<void> {
  const sets: Prisma.Sql[] = []
  if (fields.name !== undefined) sets.push(Prisma.sql`"name" = ${fields.name}`)
  if (fields.slug !== undefined) sets.push(Prisma.sql`"slug" = ${fields.slug}`)
  if (fields.description !== undefined) sets.push(Prisma.sql`"description" = ${fields.description}`)
  if (fields.shortDescription !== undefined) sets.push(Prisma.sql`"short_description" = ${fields.shortDescription}`)
  if (fields.imageUrl !== undefined) sets.push(Prisma.sql`"image_url" = ${fields.imageUrl}`)
  // jsonb, so the parameter needs an explicit cast - a bare string parameter
  // lands as text and Postgres refuses the assignment. Same shape as
  // updateProduct's descriptionPuck branch.
  if (fields.descriptionPuck !== undefined) {
    sets.push(Prisma.sql`"description_puck" = ${fields.descriptionPuck ? JSON.stringify(fields.descriptionPuck) : null}::jsonb`)
  }
  if (fields.parentId !== undefined) sets.push(Prisma.sql`"parent_id" = ${fields.parentId}`)
  if (fields.position !== undefined) sets.push(Prisma.sql`"position" = ${fields.position}`)
  if (fields.productDisplayMode !== undefined) sets.push(Prisma.sql`"product_display_mode" = ${fields.productDisplayMode}`)
  if (fields.metaTitle !== undefined) sets.push(Prisma.sql`"meta_title" = ${fields.metaTitle}`)
  if (fields.metaDescription !== undefined) sets.push(Prisma.sql`"meta_description" = ${fields.metaDescription}`)
  if (fields.ogImageId !== undefined) sets.push(Prisma.sql`"og_image_id" = ${fields.ogImageId}`)
  if (sets.length === 0) return
  sets.push(Prisma.sql`"updated_at" = CURRENT_TIMESTAMP`)
  await prisma.$executeRaw`UPDATE "shp_categories" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${id}`
}

// Deletes the category and, via the parent_id ON DELETE CASCADE, its whole
// sub-tree. Product category-links go with them; the products survive.
export async function deleteCategory(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_categories" WHERE "id" = ${id}`
}

export async function getCategoryProductCount(categoryId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "shp_product_categories" WHERE "category_id" = ${categoryId}
  `
  return Number(rows[0]?.count ?? 0)
}

// Direct product count for every category in one query, keyed by category id.
// "Direct" = filed straight under that category, not rolled up over descendants -
// it mirrors what the admin tree shows against each row. Categories with no
// products are simply absent from the map (callers default them to 0).
export async function getCategoryProductCounts(): Promise<Record<string, number>> {
  const rows = await prisma.$queryRaw<{ category_id: string; count: bigint }[]>`
    SELECT "category_id", COUNT(*)::bigint AS count
    FROM "shp_product_categories"
    GROUP BY "category_id"
  `
  const counts: Record<string, number> = {}
  for (const r of rows) counts[r.category_id] = Number(r.count)
  return counts
}

// Public product count per category: what a shopper would actually find filed
// there, rather than what the admin tree counts. ACTIVE only (a draft or
// archived product is not on the shelf) and never the catalogue-hidden variant
// children, so a range sold as one listing with forty variants counts as one
// product and not forty. Direct counts again - roll-up over descendants is done
// in the caller from the category tree it already holds, which costs no second
// query. Categories with nothing in them are absent from the map.
export async function getPublicCategoryProductCounts(): Promise<Record<string, number>> {
  const rows = await prisma.$queryRaw<{ category_id: string; count: bigint }[]>`
    SELECT pc."category_id", COUNT(*)::bigint AS count
    FROM "shp_product_categories" pc
    JOIN "shp_products" p ON p."id" = pc."product_id"
    WHERE p."status" = 'ACTIVE' AND p."catalogue_hidden" = false
    GROUP BY pc."category_id"
  `
  const counts: Record<string, number> = {}
  for (const r of rows) counts[r.category_id] = Number(r.count)
  return counts
}

// Every category id in the sub-tree rooted at categoryId, inclusive. UNION (not
// UNION ALL) makes the walk cycle-safe: a stray parent cycle repeats ids, which
// dedupe away and terminate the recursion rather than looping forever. Used to
// roll a parent category's product listing up over all its descendants.
export async function getCategoryDescendantIds(categoryId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE subtree AS (
      SELECT "id" FROM "shp_categories" WHERE "id" = ${categoryId}
      UNION
      SELECT c."id" FROM "shp_categories" c
      JOIN subtree s ON c."parent_id" = s."id"
    )
    SELECT "id" FROM subtree
  `
  return rows.map((r) => r.id)
}

// Ancestor trail for breadcrumbs, ordered root -> ... -> the category itself.
export async function getCategoryAncestorPath(
  categoryId: string
): Promise<Array<{ id: string; name: string; slug: string }>> {
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; slug: string; depth: number }>>`
    WITH RECURSIVE trail AS (
      SELECT "id", "name", "slug", "parent_id", 0 AS depth
      FROM "shp_categories" WHERE "id" = ${categoryId}
      UNION
      SELECT c."id", c."name", c."slug", c."parent_id", t.depth + 1
      FROM "shp_categories" c
      JOIN trail t ON c."id" = t."parent_id"
    )
    SELECT "id", "name", "slug", depth FROM trail ORDER BY depth DESC
  `
  return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug }))
}

// Would setting newParentId as category id's parent create a cycle? True if the
// proposed parent is the category itself or any of its own descendants.
export async function categoryReparentWouldCycle(id: string, newParentId: string): Promise<boolean> {
  if (id === newParentId) return true
  const descendants = await getCategoryDescendantIds(id)
  return descendants.includes(newParentId)
}

// Persists a sibling ordering: writes position = array index for each id. The
// admin tree sends one parent's children in their new order. When `parentId` is
// provided (including null for the top level) it is also written to every id in
// the group - that is how a drag that drops a category under a new parent both
// re-parents the moved node and reindexes its destination siblings in one shot.
// Omit `parentId` (undefined) to reorder in place without touching parentage,
// which is what the up/down arrows do.
export async function reorderCategories(
  orderedIds: string[],
  parentId?: string | null
): Promise<void> {
  if (orderedIds.length === 0) return
  const setParent = parentId !== undefined
  await prisma.$transaction(
    orderedIds.map((id, i) =>
      setParent
        ? prisma.$executeRaw`
            UPDATE "shp_categories"
            SET "position" = ${i}, "parent_id" = ${parentId}, "updated_at" = CURRENT_TIMESTAMP
            WHERE "id" = ${id}
          `
        : prisma.$executeRaw`
            UPDATE "shp_categories"
            SET "position" = ${i}, "updated_at" = CURRENT_TIMESTAMP
            WHERE "id" = ${id}
          `
    )
  )
}

// Turns a category slug + the shop-wide default into the right listProducts
// filter. Honours the category's own override: 'exact' lists only direct
// products, 'rollup' (or inherited default) lists the whole sub-tree. Shared by
// the category page and the Product Grid block so both agree.
export async function resolveCategoryProductFilter(
  categorySlug: string,
  defaultMode: 'rollup' | 'exact'
): Promise<{ categorySlug: string } | { categoryIds: string[] }> {
  const category = await getCategoryBySlug(categorySlug)
  if (!category) return { categorySlug }
  const mode = category.productDisplayMode ?? defaultMode
  if (mode === 'exact') return { categorySlug }
  return { categoryIds: await getCategoryDescendantIds(category.id) }
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

function mapTag(r: Record<string, unknown>): ShpTag {
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    description: (r.description as string | null) ?? null,
    storefrontVisible: (r.storefront_visible as boolean | null) ?? true,
    badgeEnabled: (r.badge_enabled as boolean | null) ?? false,
    badgeLabel: (r.badge_label as string | null) ?? null,
    badgeBg: (r.badge_bg as string | null) ?? null,
    badgeBgDark: (r.badge_bg_dark as string | null) ?? null,
    badgeText: (r.badge_text as string | null) ?? null,
    badgeTextDark: (r.badge_text_dark as string | null) ?? null,
    position: (r.position as number | null) ?? 0,
    metaTitle: (r.meta_title as string | null) ?? null,
    metaDescription: (r.meta_description as string | null) ?? null,
    // Anything other than the one rule this module understands reads as an
    // ordinary tag rather than as a rule nothing implements.
    autoRule: r.auto_rule === 'sale' ? 'sale' : null,
  }
}

// Position first, name as the tie-break: an install where nothing has been
// dragged yet (every position 0) still reads alphabetically.
export async function listTags(): Promise<ShpTag[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_tags" ORDER BY "position" ASC, "name" ASC
  `
  return rows.map(mapTag)
}

// The storefront's list: tags filed for admin use only never reach a shopper.
export async function listVisibleTags(): Promise<ShpTag[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_tags" WHERE "storefront_visible" = true ORDER BY "position" ASC, "name" ASC
  `
  return rows.map(mapTag)
}

export async function getTagsWithCounts(): Promise<Array<ShpTag & { productCount: number }>> {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown> & { product_count: bigint }>>`
    SELECT t.*, COUNT(pt."product_id")::bigint AS product_count
    FROM "shp_tags" t LEFT JOIN "shp_product_tags" pt ON pt."tag_id" = t."id"
    GROUP BY t."id" ORDER BY t."position" ASC, t."name" ASC
  `
  return rows.map((r) => ({ ...mapTag(r), productCount: Number(r.product_count) }))
}

export async function getTagBySlug(slug: string): Promise<ShpTag | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_tags" WHERE "slug" = ${slug} LIMIT 1`
  return rows[0] ? mapTag(rows[0]) : null
}

// Whether the tag at this slug is worked out rather than ticked, and by which
// rule. One narrow query on purpose: the product list asks per query, not per
// row, and does not want the whole row for the answer.
export async function tagAutoRule(slug: string): Promise<ShpTagAutoRule> {
  const rows = await prisma.$queryRaw<Array<{ auto_rule: string | null }>>`
    SELECT "auto_rule" FROM "shp_tags" WHERE "slug" = ${slug} LIMIT 1
  `
  return rows[0]?.auto_rule === 'sale' ? 'sale' : null
}

// A new tag lands at the end of the list rather than jumping to the top: one
// past the highest position in use, and COALESCE keeps the very first tag at 0.
export async function createTag(name: string, slug: string): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_tags" ("name", "slug", "position")
    VALUES (${name}, ${slug}, (SELECT COALESCE(MAX("position"), -1) + 1 FROM "shp_tags"))
    RETURNING "id"
  `
  return rows[0]
}

export type TagWritableFields = Partial<{
  name: string
  slug: string
  description: string | null
  storefrontVisible: boolean
  badgeEnabled: boolean
  badgeLabel: string | null
  badgeBg: string | null
  badgeBgDark: string | null
  badgeText: string | null
  badgeTextDark: string | null
  position: number
  metaTitle: string | null
  metaDescription: string | null
}>

// Same shape as updateCategory: only the keys actually sent are written, so a
// screen editing one field cannot blank the rest. shp_tags carries no
// updated_at, so unlike its category sibling there is no timestamp to stamp.
export async function updateTag(id: string, fields: TagWritableFields): Promise<void> {
  const sets: Prisma.Sql[] = []
  if (fields.name !== undefined) sets.push(Prisma.sql`"name" = ${fields.name}`)
  if (fields.slug !== undefined) sets.push(Prisma.sql`"slug" = ${fields.slug}`)
  if (fields.description !== undefined) sets.push(Prisma.sql`"description" = ${fields.description}`)
  if (fields.storefrontVisible !== undefined) sets.push(Prisma.sql`"storefront_visible" = ${fields.storefrontVisible}`)
  if (fields.badgeEnabled !== undefined) sets.push(Prisma.sql`"badge_enabled" = ${fields.badgeEnabled}`)
  if (fields.badgeLabel !== undefined) sets.push(Prisma.sql`"badge_label" = ${fields.badgeLabel}`)
  if (fields.badgeBg !== undefined) sets.push(Prisma.sql`"badge_bg" = ${fields.badgeBg}`)
  if (fields.badgeBgDark !== undefined) sets.push(Prisma.sql`"badge_bg_dark" = ${fields.badgeBgDark}`)
  if (fields.badgeText !== undefined) sets.push(Prisma.sql`"badge_text" = ${fields.badgeText}`)
  if (fields.badgeTextDark !== undefined) sets.push(Prisma.sql`"badge_text_dark" = ${fields.badgeTextDark}`)
  if (fields.position !== undefined) sets.push(Prisma.sql`"position" = ${fields.position}`)
  if (fields.metaTitle !== undefined) sets.push(Prisma.sql`"meta_title" = ${fields.metaTitle}`)
  if (fields.metaDescription !== undefined) sets.push(Prisma.sql`"meta_description" = ${fields.metaDescription}`)
  if (sets.length === 0) return
  await prisma.$executeRaw`UPDATE "shp_tags" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${id}`
}

// Position is written as the array index, the way reorderCategories does it.
export async function reorderTags(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return
  await prisma.$transaction(
    orderedIds.map((id, i) => prisma.$executeRaw`UPDATE "shp_tags" SET "position" = ${i} WHERE "id" = ${id}`)
  )
}

// Finds an existing tag by slug, else creates one - used by the CSV importer
// and the admin tag picker's "create on the fly" affordance.
export async function findOrCreateTagBySlug(name: string, slug: string): Promise<{ id: string }> {
  const existing = await getTagBySlug(slug)
  if (existing) return { id: existing.id }
  return createTag(name, slug)
}

export async function deleteTag(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_tags" WHERE "id" = ${id}`
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

function mapCollection(r: Record<string, unknown>): ShpCollection {
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    description: (r.description as string | null) ?? null,
    shortDescription: (r.short_description as string | null) ?? null,
    // Absent from the listCollections projection on purpose - see below.
    descriptionPuck: (r.description_puck as PuckData | null) ?? null,
    imageId: (r.image_id as string | null) ?? null,
    position: r.position as number,
    metaTitle: (r.meta_title as string | null) ?? null,
    metaDescription: (r.meta_description as string | null) ?? null,
    ogImageId: (r.og_image_id as string | null) ?? null,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

// Every column except description_puck, for the same reason categories leave it
// out of their listing: a designed description is a whole builder document, and
// nothing that lists collections renders one. Rows come back with
// descriptionPuck null; fetch the single collection when the document is wanted.
const COLLECTION_LIST_COLUMNS = Prisma.sql`
  "id", "name", "slug", "description", "short_description", "image_id", "position",
  "meta_title", "meta_description", "og_image_id", "created_at", "updated_at"
`

// True when this collection has a designed description saved, so the admin can
// show which ones have been designed without fetching any of the documents.
export type ShpCollectionListRow = ShpCollection & { hasDesignedDescription: boolean }

export async function listCollections(): Promise<ShpCollectionListRow[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT ${COLLECTION_LIST_COLUMNS}, ("description_puck" IS NOT NULL) AS has_designed_description
    FROM "shp_collections"
    ORDER BY "position" ASC, "name" ASC
  `
  return rows.map((r) => ({ ...mapCollection(r), hasDesignedDescription: r.has_designed_description === true }))
}

export async function getCollectionById(id: string): Promise<ShpCollection | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_collections" WHERE "id" = ${id} LIMIT 1`
  return rows[0] ? mapCollection(rows[0]) : null
}

export async function getCollectionBySlug(slug: string): Promise<ShpCollection | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_collections" WHERE "slug" = ${slug} LIMIT 1`
  return rows[0] ? mapCollection(rows[0]) : null
}

export async function createCollection(data: {
  name: string; slug: string; description?: string | null; shortDescription?: string | null; imageId?: string | null
}): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_collections" ("name", "slug", "description", "short_description", "image_id")
    VALUES (${data.name}, ${data.slug}, ${data.description ?? null}, ${data.shortDescription ?? null}, ${data.imageId ?? null})
    RETURNING "id"
  `
  return rows[0]
}

export async function updateCollection(id: string, fields: Partial<{
  name: string; slug: string; description: string | null; imageId: string | null; position: number
  shortDescription: string | null; descriptionPuck: PuckData | null
  metaTitle: string | null; metaDescription: string | null; ogImageId: string | null
}>): Promise<void> {
  const sets: Prisma.Sql[] = []
  if (fields.name !== undefined) sets.push(Prisma.sql`"name" = ${fields.name}`)
  if (fields.slug !== undefined) sets.push(Prisma.sql`"slug" = ${fields.slug}`)
  if (fields.description !== undefined) sets.push(Prisma.sql`"description" = ${fields.description}`)
  if (fields.shortDescription !== undefined) sets.push(Prisma.sql`"short_description" = ${fields.shortDescription}`)
  // jsonb, so the parameter needs an explicit cast - a bare string parameter
  // lands as text and Postgres refuses the assignment. Same shape as
  // updateCategory's descriptionPuck branch.
  if (fields.descriptionPuck !== undefined) {
    sets.push(Prisma.sql`"description_puck" = ${fields.descriptionPuck ? JSON.stringify(fields.descriptionPuck) : null}::jsonb`)
  }
  if (fields.imageId !== undefined) sets.push(Prisma.sql`"image_id" = ${fields.imageId}`)
  if (fields.position !== undefined) sets.push(Prisma.sql`"position" = ${fields.position}`)
  if (fields.metaTitle !== undefined) sets.push(Prisma.sql`"meta_title" = ${fields.metaTitle}`)
  if (fields.metaDescription !== undefined) sets.push(Prisma.sql`"meta_description" = ${fields.metaDescription}`)
  if (fields.ogImageId !== undefined) sets.push(Prisma.sql`"og_image_id" = ${fields.ogImageId}`)
  if (sets.length === 0) return
  sets.push(Prisma.sql`"updated_at" = CURRENT_TIMESTAMP`)
  await prisma.$executeRaw`UPDATE "shp_collections" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${id}`
}

export async function deleteCollection(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_collections" WHERE "id" = ${id}`
}

// The collection index: every collection that actually has something in it,
// with its product count and a cover picture borrowed from its first member.
//
// Collections carry an image_id column that nothing has ever rendered, so the
// tile would otherwise be a grey box. Taking the first member's primary image
// means an index page looks finished the moment a collection is created, and
// keeps looking right as membership changes - nobody has to remember to set a
// cover. Empty collections are left out: a tile promising products and landing
// on an empty grid is worse than no tile.
export async function listCollectionsForIndex(): Promise<Array<{
  id: string
  name: string
  slug: string
  description: string | null
  productCount: number
  coverUrl: string | null
}>> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT c."id", c."name", c."slug",
           -- The card blurb: the one-liner when there is one, else the long
           -- description, so a collection written up before short descriptions
           -- existed keeps the tile it has always had.
           COALESCE(NULLIF(c."short_description", ''), c."description") AS "description",
           (SELECT count(*) FROM "shp_product_collections" pc
              JOIN "shp_products" p ON p."id" = pc."product_id"
             WHERE pc."collection_id" = c."id" AND p."status" = 'ACTIVE' AND p."catalogue_hidden" = false
           )::int AS "product_count",
           cover."url" AS "cover_url"
      FROM "shp_collections" c
      LEFT JOIN LATERAL (
        SELECT m."url"
          FROM "shp_product_collections" pc
          JOIN "shp_products" p ON p."id" = pc."product_id"
          JOIN "shp_product_media" m ON m."product_id" = p."id" AND m."type" = 'IMAGE'
         WHERE pc."collection_id" = c."id" AND p."status" = 'ACTIVE' AND p."catalogue_hidden" = false
         ORDER BY pc."position" ASC, m."is_primary" DESC, m."position" ASC
         LIMIT 1
      ) cover ON true
     ORDER BY c."position" ASC, c."name" ASC
  `
  return rows
    .map((r) => ({
      id: r.id as string,
      name: r.name as string,
      slug: r.slug as string,
      description: (r.description as string | null) ?? null,
      productCount: Number(r.product_count ?? 0),
      coverUrl: (r.cover_url as string | null) ?? null,
    }))
    .filter((c) => c.productCount > 0)
}

// A random handful of collection links for the footer's Collection Links
// block. Deliberately the lightest read on this page: name and slug only, no
// counts, no cover images - it runs on every page of the site. The EXISTS
// keeps empty and hidden-only collections out, same rule as the index above,
// and Postgres does the shuffling so each request genuinely gets a fresh
// draw rather than a cached one.
export async function listRandomCollectionLinks(limit: number): Promise<Array<{ name: string; slug: string }>> {
  const capped = Math.max(1, Math.min(24, Math.floor(limit)))
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT c."name", c."slug"
      FROM "shp_collections" c
     WHERE EXISTS (
       SELECT 1 FROM "shp_product_collections" pc
         JOIN "shp_products" p ON p."id" = pc."product_id"
        WHERE pc."collection_id" = c."id" AND p."status" = 'ACTIVE' AND p."catalogue_hidden" = false
     )
     ORDER BY random()
     LIMIT ${capped}
  `
  return rows.map((r) => ({ name: r.name as string, slug: r.slug as string }))
}

// Manages membership from the collection side (product order in this one
// collection) - unlike setProductCollections, this never touches a product's
// membership in any *other* collection.
export async function setCollectionProducts(collectionId: string, productIds: string[]): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM "shp_product_collections" WHERE "collection_id" = ${collectionId}`,
    ...productIds.map((productId, i) => prisma.$executeRaw`
      INSERT INTO "shp_product_collections" ("product_id", "collection_id", "position") VALUES (${productId}, ${collectionId}, ${i})
      ON CONFLICT DO NOTHING
    `),
  ])
}

// How many products sit in each collection, keyed by collection id. Mirrors
// getCategoryProductCounts - one grouped read for the whole admin list rather
// than a count query per row.
export async function getCollectionProductCounts(): Promise<Record<string, number>> {
  const rows = await prisma.$queryRaw<{ collection_id: string; count: bigint }[]>`
    SELECT "collection_id", COUNT(*)::bigint AS count
    FROM "shp_product_collections"
    GROUP BY "collection_id"
  `
  const counts: Record<string, number> = {}
  for (const r of rows) counts[r.collection_id] = Number(r.count)
  return counts
}

// Position is written as the array index, the way reorderCategories and
// reorderTags do it. Collections list in this order everywhere (listCollections
// orders by position, then name), so this is what the admin's drag handles and
// up/down arrows persist.
export async function reorderCollections(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return
  await prisma.$transaction(
    orderedIds.map((id, i) => prisma.$executeRaw`
      UPDATE "shp_collections" SET "position" = ${i}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${id}
    `)
  )
}

/** One row of a collection's product list, as the admin's Products panel needs it. */
export type CollectionProductRow = {
  id: string
  name: string
  slug: string
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  position: number
  imageUrl: string | null
}

// The products filed in one collection, in the order the collection lists them.
// The picture comes from the same primary-image rule getPrimaryProductImages
// uses, inlined as a lateral sub-select so the whole panel is one query.
export async function listCollectionProducts(collectionId: string): Promise<CollectionProductRow[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      p."id", p."name", p."slug", p."status", pc."position",
      (
        SELECT m."url" FROM "shp_product_media" m
        WHERE m."product_id" = p."id" AND m."type" = 'IMAGE'
        ORDER BY m."is_primary" DESC, m."position" ASC
        LIMIT 1
      ) AS image_url
    FROM "shp_product_collections" pc
    JOIN "shp_products" p ON p."id" = pc."product_id"
    WHERE pc."collection_id" = ${collectionId}
    ORDER BY pc."position" ASC, p."name" ASC
  `
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    status: r.status as 'DRAFT' | 'ACTIVE' | 'ARCHIVED',
    position: r.position as number,
    imageUrl: (r.image_url as string | null) ?? null,
  }))
}

// Adds products to the end of a collection, leaving everything already in it
// exactly where it was. setCollectionProducts replaces the whole membership,
// which is right for a reorder and wrong for an "add these" - hence both.
export async function addProductsToCollection(collectionId: string, productIds: string[]): Promise<void> {
  if (productIds.length === 0) return
  const rows = await prisma.$queryRaw<{ next: number }[]>`
    SELECT COALESCE(MAX("position"), -1) + 1 AS next
    FROM "shp_product_collections" WHERE "collection_id" = ${collectionId}
  `
  const start = Number(rows[0]?.next ?? 0)
  await prisma.$transaction(
    productIds.map((productId, i) => prisma.$executeRaw`
      INSERT INTO "shp_product_collections" ("product_id", "collection_id", "position")
      VALUES (${productId}, ${collectionId}, ${start + i})
      ON CONFLICT DO NOTHING
    `)
  )
}

// Copies a collection - its content, its SEO and its product list, in order -
// into a fresh one. The caller supplies the new name and slug so uniqueness is
// settled before anything is written.
export async function duplicateCollection(
  sourceId: string,
  next: { name: string; slug: string }
): Promise<{ id: string } | null> {
  const source = await getCollectionById(sourceId)
  if (!source) return null
  const created = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "shp_collections" ("name", "slug", "description", "image_id", "position", "meta_title", "meta_description", "og_image_id")
    VALUES (
      ${next.name}, ${next.slug}, ${source.description}, ${source.imageId},
      ${source.position}, ${source.metaTitle}, ${source.metaDescription}, ${source.ogImageId}
    )
    RETURNING "id"
  `
  const row = created[0]
  if (!row) return null
  await prisma.$executeRaw`
    INSERT INTO "shp_product_collections" ("product_id", "collection_id", "position")
    SELECT "product_id", ${row.id}, "position"
    FROM "shp_product_collections" WHERE "collection_id" = ${sourceId}
    ON CONFLICT DO NOTHING
  `
  return { id: row.id }
}

// Up to four product pictures per collection, in the order the collection lists
// them, so the admin list can show what is actually in each one rather than a
// row of identical grey boxes. Products with no picture are dropped before the
// ranking, otherwise a collection whose first four happen to be image-less
// would come back empty-handed despite being full.
export async function getCollectionPreviewImages(): Promise<Record<string, string[]>> {
  const rows = await prisma.$queryRaw<{ collection_id: string; url: string }[]>`
    WITH firsts AS (
      SELECT
        pc."collection_id",
        pc."position",
        (
          SELECT m."url" FROM "shp_product_media" m
          WHERE m."product_id" = pc."product_id" AND m."type" = 'IMAGE'
          ORDER BY m."is_primary" DESC, m."position" ASC
          LIMIT 1
        ) AS url
      FROM "shp_product_collections" pc
    ),
    ranked AS (
      SELECT "collection_id", url, ROW_NUMBER() OVER (PARTITION BY "collection_id" ORDER BY "position" ASC) AS rn
      FROM firsts WHERE url IS NOT NULL
    )
    SELECT "collection_id", url FROM ranked WHERE rn <= 4
  `
  const out: Record<string, string[]> = {}
  for (const r of rows) (out[r.collection_id] ??= []).push(r.url)
  return out
}
