import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { ShpCategory, ShpTag, ShpCollection } from '@/modules/shop/lib/types'

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function mapCategory(r: Record<string, unknown>): ShpCategory {
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    description: (r.description as string | null) ?? null,
    parentId: (r.parent_id as string | null) ?? null,
    position: r.position as number,
    metaTitle: (r.meta_title as string | null) ?? null,
    metaDescription: (r.meta_description as string | null) ?? null,
    ogImageId: (r.og_image_id as string | null) ?? null,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

export async function listCategories(): Promise<ShpCategory[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_categories" ORDER BY "position" ASC, "name" ASC`
  return rows.map(mapCategory)
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
  name: string; slug: string; description?: string | null; parentId?: string | null
}): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_categories" ("name", "slug", "description", "parent_id")
    VALUES (${data.name}, ${data.slug}, ${data.description ?? null}, ${data.parentId ?? null})
    RETURNING "id"
  `
  return rows[0]
}

export async function updateCategory(id: string, fields: Partial<{
  name: string; slug: string; description: string | null; parentId: string | null; position: number
  metaTitle: string | null; metaDescription: string | null; ogImageId: string | null
}>): Promise<void> {
  const sets: Prisma.Sql[] = []
  if (fields.name !== undefined) sets.push(Prisma.sql`"name" = ${fields.name}`)
  if (fields.slug !== undefined) sets.push(Prisma.sql`"slug" = ${fields.slug}`)
  if (fields.description !== undefined) sets.push(Prisma.sql`"description" = ${fields.description}`)
  if (fields.parentId !== undefined) sets.push(Prisma.sql`"parent_id" = ${fields.parentId}`)
  if (fields.position !== undefined) sets.push(Prisma.sql`"position" = ${fields.position}`)
  if (fields.metaTitle !== undefined) sets.push(Prisma.sql`"meta_title" = ${fields.metaTitle}`)
  if (fields.metaDescription !== undefined) sets.push(Prisma.sql`"meta_description" = ${fields.metaDescription}`)
  if (fields.ogImageId !== undefined) sets.push(Prisma.sql`"og_image_id" = ${fields.ogImageId}`)
  if (sets.length === 0) return
  sets.push(Prisma.sql`"updated_at" = CURRENT_TIMESTAMP`)
  await prisma.$executeRaw`UPDATE "shp_categories" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${id}`
}

export async function deleteCategory(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_categories" WHERE "id" = ${id}`
}

export async function getCategoryProductCount(categoryId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "shp_product_categories" WHERE "category_id" = ${categoryId}
  `
  return Number(rows[0]?.count ?? 0)
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

function mapTag(r: Record<string, unknown>): ShpTag {
  return { id: r.id as string, name: r.name as string, slug: r.slug as string }
}

export async function listTags(): Promise<ShpTag[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_tags" ORDER BY "name" ASC`
  return rows.map(mapTag)
}

export async function getTagsWithCounts(): Promise<Array<ShpTag & { productCount: number }>> {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown> & { product_count: bigint }>>`
    SELECT t.*, COUNT(pt."product_id")::bigint AS product_count
    FROM "shp_tags" t LEFT JOIN "shp_product_tags" pt ON pt."tag_id" = t."id"
    GROUP BY t."id" ORDER BY t."name" ASC
  `
  return rows.map((r) => ({ ...mapTag(r), productCount: Number(r.product_count) }))
}

export async function getTagBySlug(slug: string): Promise<ShpTag | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_tags" WHERE "slug" = ${slug} LIMIT 1`
  return rows[0] ? mapTag(rows[0]) : null
}

export async function createTag(name: string, slug: string): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_tags" ("name", "slug") VALUES (${name}, ${slug}) RETURNING "id"
  `
  return rows[0]
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
    imageId: (r.image_id as string | null) ?? null,
    position: r.position as number,
    metaTitle: (r.meta_title as string | null) ?? null,
    metaDescription: (r.meta_description as string | null) ?? null,
    ogImageId: (r.og_image_id as string | null) ?? null,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

export async function listCollections(): Promise<ShpCollection[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_collections" ORDER BY "position" ASC, "name" ASC`
  return rows.map(mapCollection)
}

export async function getCollectionById(id: string): Promise<ShpCollection | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_collections" WHERE "id" = ${id} LIMIT 1`
  return rows[0] ? mapCollection(rows[0]) : null
}

export async function getCollectionBySlug(slug: string): Promise<ShpCollection | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_collections" WHERE "slug" = ${slug} LIMIT 1`
  return rows[0] ? mapCollection(rows[0]) : null
}

export async function createCollection(data: { name: string; slug: string; description?: string | null; imageId?: string | null }): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_collections" ("name", "slug", "description", "image_id")
    VALUES (${data.name}, ${data.slug}, ${data.description ?? null}, ${data.imageId ?? null})
    RETURNING "id"
  `
  return rows[0]
}

export async function updateCollection(id: string, fields: Partial<{
  name: string; slug: string; description: string | null; imageId: string | null; position: number
  metaTitle: string | null; metaDescription: string | null; ogImageId: string | null
}>): Promise<void> {
  const sets: Prisma.Sql[] = []
  if (fields.name !== undefined) sets.push(Prisma.sql`"name" = ${fields.name}`)
  if (fields.slug !== undefined) sets.push(Prisma.sql`"slug" = ${fields.slug}`)
  if (fields.description !== undefined) sets.push(Prisma.sql`"description" = ${fields.description}`)
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
