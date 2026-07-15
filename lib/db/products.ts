import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { ShpProduct, ShpProductMedia, ShpProductStatus, ShpProductType } from '@/modules/shop/lib/types'

function mapProduct(r: Record<string, unknown>): ShpProduct {
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    type: r.type as ShpProductType,
    status: r.status as ShpProductStatus,
    description: (r.description as string | null) ?? null,
    shortDescription: (r.short_description as string | null) ?? null,
    sku: (r.sku as string | null) ?? null,
    barcode: (r.barcode as string | null) ?? null,
    price: (r.price as { toString(): string }).toString(),
    compareAtPrice: r.compare_at_price != null ? (r.compare_at_price as { toString(): string }).toString() : null,
    costPrice: r.cost_price != null ? (r.cost_price as { toString(): string }).toString() : null,
    taxClassId: (r.tax_class_id as string | null) ?? null,
    trackInventory: r.track_inventory as boolean,
    stockCount: (r.stock_count as number | null) ?? null,
    lowStockThreshold: (r.low_stock_threshold as number | null) ?? null,
    outOfStockBehaviour: r.out_of_stock_behaviour as ShpProduct['outOfStockBehaviour'],
    weight: r.weight != null ? (r.weight as { toString(): string }).toString() : null,
    weightUnit: (r.weight_unit as string | null) ?? null,
    dimensionL: r.dimension_l != null ? (r.dimension_l as { toString(): string }).toString() : null,
    dimensionW: r.dimension_w != null ? (r.dimension_w as { toString(): string }).toString() : null,
    dimensionH: r.dimension_h != null ? (r.dimension_h as { toString(): string }).toString() : null,
    dimensionUnit: (r.dimension_unit as string | null) ?? null,
    digitalFileId: (r.digital_file_id as string | null) ?? null,
    downloadLimit: (r.download_limit as number | null) ?? null,
    downloadExpiry: (r.download_expiry as number | null) ?? null,
    metaTitle: (r.meta_title as string | null) ?? null,
    metaDescription: (r.meta_description as string | null) ?? null,
    ogImageId: (r.og_image_id as string | null) ?? null,
    masterCategoryId: (r.master_category_id as string | null) ?? null,
    isPreOrder: r.is_pre_order as boolean,
    preOrderDispatchDate: (r.pre_order_dispatch_date as Date | null) ?? null,
    preOrderNote: (r.pre_order_note as string | null) ?? null,
    preOrderMaxQuantity: (r.pre_order_max_quantity as number | null) ?? null,
    preOrderCount: r.pre_order_count as number,
    relatedMode: r.related_mode as ShpProduct['relatedMode'],
    upsellMode: r.upsell_mode as ShpProduct['upsellMode'],
    relatedLimit: r.related_limit as number,
    upsellLimit: r.upsell_limit as number,
    catalogueHidden: (r.catalogue_hidden as boolean | null) ?? false,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

function mapMedia(r: Record<string, unknown>): ShpProductMedia {
  return {
    id: r.id as string,
    productId: r.product_id as string,
    type: r.type as ShpProductMedia['type'],
    url: r.url as string,
    altText: (r.alt_text as string | null) ?? null,
    position: r.position as number,
    isPrimary: r.is_primary as boolean,
    createdAt: r.created_at as Date,
  }
}

export async function getProductById(id: string): Promise<ShpProduct | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_products" WHERE "id" = ${id} LIMIT 1`
  return rows[0] ? mapProduct(rows[0]) : null
}

export async function getProductBySlug(slug: string): Promise<ShpProduct | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_products" WHERE "slug" = ${slug} LIMIT 1`
  return rows[0] ? mapProduct(rows[0]) : null
}

export async function getProductMedia(productId: string): Promise<ShpProductMedia[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_product_media" WHERE "product_id" = ${productId} ORDER BY "position" ASC
  `
  return rows.map(mapMedia)
}

export async function getProductCategoryIds(productId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ category_id: string }[]>`
    SELECT "category_id" FROM "shp_product_categories" WHERE "product_id" = ${productId}
  `
  return rows.map((r) => r.category_id)
}

export async function getProductTagIds(productId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ tag_id: string }[]>`SELECT "tag_id" FROM "shp_product_tags" WHERE "product_id" = ${productId}`
  return rows.map((r) => r.tag_id)
}

export async function getProductCollectionIds(productId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ collection_id: string }[]>`
    SELECT "collection_id" FROM "shp_product_collections" WHERE "product_id" = ${productId} ORDER BY "position" ASC
  `
  return rows.map((r) => r.collection_id)
}

// The primary category is the first category in ShpProductCategory ordered by
// position (addendum D.3) - but the join table has no position column of its
// own, so "first" is by insertion (ctid) order, matching how getProductCategoryIds
// returns them (no explicit ORDER BY = physical row order).
export async function getPrimaryCategoryId(productId: string): Promise<string | null> {
  // The master category is the lead one when set; otherwise fall back to any
  // membership so recommendations still have a category to key off.
  const master = await prisma.$queryRaw<{ master_category_id: string | null }[]>`
    SELECT "master_category_id" FROM "shp_products" WHERE "id" = ${productId} LIMIT 1
  `
  if (master[0]?.master_category_id) return master[0].master_category_id
  const rows = await prisma.$queryRaw<{ category_id: string }[]>`
    SELECT "category_id" FROM "shp_product_categories" WHERE "product_id" = ${productId} LIMIT 1
  `
  return rows[0]?.category_id ?? null
}

export type ListProductsFilter = {
  page?: number
  perPage?: number
  status?: ShpProductStatus
  type?: ShpProductType
  categorySlug?: string
  // Match products filed in ANY of these category ids - used for the
  // roll-up listing where a parent category shows its descendants' products.
  categoryIds?: string[]
  tagSlug?: string
  collectionSlug?: string
  search?: string
  preOrder?: boolean
  // Exclude catalogue-hidden rows (the variant child products). The public
  // grid, search and admin product list pass true; variations' own queries
  // pass false to reach the children.
  excludeHidden?: boolean
}

export async function listProducts(filter: ListProductsFilter): Promise<{ products: ShpProduct[]; total: number }> {
  // Clamp pagination centrally: guards against NaN/negative/huge perPage from
  // the unauthenticated public list (LIMIT NaN 500s; perPage=1e9 is a DoS).
  const page = Math.max(1, Math.floor(Number(filter.page)) || 1)
  const perPage = Math.min(100, Math.max(1, Math.floor(Number(filter.perPage)) || 24))
  const offset = (page - 1) * perPage

  const conditions: Prisma.Sql[] = []
  if (filter.status) conditions.push(Prisma.sql`p."status" = ${filter.status}`)
  if (filter.type) conditions.push(Prisma.sql`p."type" = ${filter.type}`)
  if (filter.preOrder) conditions.push(Prisma.sql`p."is_pre_order" = true`)
  if (filter.excludeHidden) conditions.push(Prisma.sql`p."catalogue_hidden" = false`)
  if (filter.search) conditions.push(Prisma.sql`(p."name" ILIKE ${`%${filter.search}%`} OR p."sku" ILIKE ${`%${filter.search}%`})`)
  if (filter.categorySlug) {
    conditions.push(Prisma.sql`p."id" IN (
      SELECT "product_id" FROM "shp_product_categories" pc
      JOIN "shp_categories" c ON c."id" = pc."category_id"
      WHERE c."slug" = ${filter.categorySlug}
    )`)
  }
  if (filter.categoryIds && filter.categoryIds.length > 0) {
    conditions.push(Prisma.sql`p."id" IN (
      SELECT "product_id" FROM "shp_product_categories"
      WHERE "category_id" IN (${Prisma.join(filter.categoryIds)})
    )`)
  }
  if (filter.tagSlug) {
    conditions.push(Prisma.sql`p."id" IN (
      SELECT "product_id" FROM "shp_product_tags" pt
      JOIN "shp_tags" t ON t."id" = pt."tag_id"
      WHERE t."slug" = ${filter.tagSlug}
    )`)
  }
  if (filter.collectionSlug) {
    conditions.push(Prisma.sql`p."id" IN (
      SELECT "product_id" FROM "shp_product_collections" pcol
      JOIN "shp_collections" col ON col."id" = pcol."collection_id"
      WHERE col."slug" = ${filter.collectionSlug}
    )`)
  }

  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty

  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT p.* FROM "shp_products" p ${where}
    ORDER BY p."created_at" DESC
    LIMIT ${perPage} OFFSET ${offset}
  `
  const countRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "shp_products" p ${where}
  `
  return { products: rows.map(mapProduct), total: Number(countRows[0]?.count ?? 0) }
}

export type CreateProductInput = {
  name: string
  slug: string
  type: ShpProductType
  status?: ShpProductStatus
  description?: string | null
  shortDescription?: string | null
  sku?: string | null
  barcode?: string | null
  price: number
  compareAtPrice?: number | null
  costPrice?: number | null
  taxClassId?: string | null
  trackInventory?: boolean
  stockCount?: number | null
  lowStockThreshold?: number | null
  outOfStockBehaviour?: ShpProduct['outOfStockBehaviour']
  weight?: number | null
  // Create the row hidden from the catalogue (used for variation child products).
  catalogueHidden?: boolean
}

export async function createProduct(data: CreateProductInput): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_products" (
      "name", "slug", "type", "status", "description", "short_description", "sku", "barcode",
      "price", "compare_at_price", "cost_price", "tax_class_id",
      "track_inventory", "stock_count", "low_stock_threshold", "out_of_stock_behaviour",
      "weight", "catalogue_hidden"
    ) VALUES (
      ${data.name}, ${data.slug}, ${data.type}, ${data.status ?? 'DRAFT'}, ${data.description ?? null}, ${data.shortDescription ?? null}, ${data.sku ?? null}, ${data.barcode ?? null},
      ${data.price}, ${data.compareAtPrice ?? null}, ${data.costPrice ?? null}, ${data.taxClassId ?? null},
      ${data.trackInventory ?? false}, ${data.stockCount ?? null}, ${data.lowStockThreshold ?? null}, ${data.outOfStockBehaviour ?? 'BLOCK'},
      ${data.weight ?? null}, ${data.catalogueHidden ?? false}
    )
    RETURNING "id"
  `
  return rows[0]
}

// Partial update. Returns the previous stockCount/outOfStockBehaviour so
// callers (the admin PUT route) can detect a back-in-stock transition
// without a second read (addendum A.3).
export type UpdateProductInput = Partial<{
  name: string
  slug: string
  status: ShpProductStatus
  description: string | null
  shortDescription: string | null
  sku: string | null
  barcode: string | null
  price: number
  compareAtPrice: number | null
  costPrice: number | null
  taxClassId: string | null
  trackInventory: boolean
  stockCount: number | null
  lowStockThreshold: number | null
  outOfStockBehaviour: ShpProduct['outOfStockBehaviour']
  weight: number | null
  weightUnit: string | null
  dimensionL: number | null
  dimensionW: number | null
  dimensionH: number | null
  dimensionUnit: string | null
  digitalFileId: string | null
  downloadLimit: number | null
  downloadExpiry: number | null
  metaTitle: string | null
  metaDescription: string | null
  ogImageId: string | null
  masterCategoryId: string | null
  isPreOrder: boolean
  preOrderDispatchDate: Date | null
  preOrderNote: string | null
  preOrderMaxQuantity: number | null
  relatedMode: ShpProduct['relatedMode']
  upsellMode: ShpProduct['upsellMode']
  relatedLimit: number
  upsellLimit: number
  catalogueHidden: boolean
}>

const COLUMN_MAP: Record<keyof UpdateProductInput, string> = {
  name: 'name', slug: 'slug', status: 'status', description: 'description', shortDescription: 'short_description',
  sku: 'sku', barcode: 'barcode', price: 'price', compareAtPrice: 'compare_at_price', costPrice: 'cost_price',
  taxClassId: 'tax_class_id', trackInventory: 'track_inventory', stockCount: 'stock_count',
  lowStockThreshold: 'low_stock_threshold', outOfStockBehaviour: 'out_of_stock_behaviour',
  weight: 'weight', weightUnit: 'weight_unit', dimensionL: 'dimension_l', dimensionW: 'dimension_w',
  dimensionH: 'dimension_h', dimensionUnit: 'dimension_unit', digitalFileId: 'digital_file_id',
  downloadLimit: 'download_limit', downloadExpiry: 'download_expiry', metaTitle: 'meta_title',
  metaDescription: 'meta_description', ogImageId: 'og_image_id', masterCategoryId: 'master_category_id', isPreOrder: 'is_pre_order',
  preOrderDispatchDate: 'pre_order_dispatch_date', preOrderNote: 'pre_order_note',
  preOrderMaxQuantity: 'pre_order_max_quantity', relatedMode: 'related_mode', upsellMode: 'upsell_mode',
  relatedLimit: 'related_limit', upsellLimit: 'upsell_limit', catalogueHidden: 'catalogue_hidden',
}

export async function updateProduct(id: string, fields: UpdateProductInput): Promise<void> {
  const sets: Prisma.Sql[] = []
  for (const key of Object.keys(fields) as (keyof UpdateProductInput)[]) {
    const value = fields[key]
    if (value === undefined) continue
    const column = COLUMN_MAP[key]
    sets.push(Prisma.sql`${Prisma.raw(`"${column}"`)} = ${value}`)
  }
  if (sets.length === 0) return
  sets.push(Prisma.sql`"updated_at" = CURRENT_TIMESTAMP`)
  // Any stock count change re-arms the low-stock cron dedupe marker - a fresh
  // restock (or a further drop) should be eligible for its own alert.
  if ('stockCount' in fields) sets.push(Prisma.sql`"low_stock_alerted_at" = NULL`)
  await prisma.$executeRaw`UPDATE "shp_products" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${id}`
}

export type LowStockProduct = { id: string; name: string; stockCount: number | null; lowStockThreshold: number | null }

export async function getUnalertedLowStockProducts(): Promise<LowStockProduct[]> {
  const rows = await prisma.$queryRaw<LowStockProduct[]>`
    SELECT "id", "name", "stock_count" AS "stockCount", "low_stock_threshold" AS "lowStockThreshold"
    FROM "shp_products"
    WHERE "track_inventory" = true AND "low_stock_threshold" IS NOT NULL
      AND "stock_count" <= "low_stock_threshold" AND "low_stock_alerted_at" IS NULL
  `
  return rows
}

export async function markLowStockAlerted(productIds: string[]): Promise<void> {
  if (productIds.length === 0) return
  await prisma.$executeRaw`UPDATE "shp_products" SET "low_stock_alerted_at" = CURRENT_TIMESTAMP WHERE "id" IN (${Prisma.join(productIds)})`
}

export async function incrementPreOrderCount(productId: string, qty: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_products" SET "pre_order_count" = "pre_order_count" + ${qty}, "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${productId}
  `
  // Auto-flip off pre-order once the cap is reached (addendum B.4)
  await prisma.$executeRaw`
    UPDATE "shp_products" SET "is_pre_order" = false
    WHERE "id" = ${productId} AND "pre_order_max_quantity" IS NOT NULL AND "pre_order_count" >= "pre_order_max_quantity"
  `
}

export async function decrementStockOnShip(orderItemIds: string[]): Promise<void> {
  if (orderItemIds.length === 0) return
  await prisma.$executeRaw`
    UPDATE "shp_products" p SET "stock_count" = GREATEST(COALESCE(p."stock_count", 0) - oi."quantity", 0)
    FROM "shp_order_items" oi
    WHERE oi."id" IN (${Prisma.join(orderItemIds)}) AND oi."product_id" = p."id" AND p."track_inventory" = true
  `
}

export async function deleteProduct(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_products" WHERE "id" = ${id}`
}

export async function setProductMedia(
  productId: string,
  media: Array<{ type: ShpProductMedia['type']; url: string; altText?: string | null; isPrimary?: boolean }>
): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM "shp_product_media" WHERE "product_id" = ${productId}`,
    ...media.map((m, i) =>
      prisma.$executeRaw`
        INSERT INTO "shp_product_media" ("product_id", "type", "url", "alt_text", "position", "is_primary")
        VALUES (${productId}, ${m.type}, ${m.url}, ${m.altText ?? null}, ${i}, ${m.isPrimary ?? i === 0})
      `
    ),
  ])
}

export async function setProductCategories(productId: string, categoryIds: string[]): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM "shp_product_categories" WHERE "product_id" = ${productId}`,
    ...categoryIds.map(
      (categoryId) => prisma.$executeRaw`
        INSERT INTO "shp_product_categories" ("product_id", "category_id") VALUES (${productId}, ${categoryId})
        ON CONFLICT DO NOTHING
      `
    ),
  ])
}

export async function setProductTags(productId: string, tagIds: string[]): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM "shp_product_tags" WHERE "product_id" = ${productId}`,
    ...tagIds.map(
      (tagId) => prisma.$executeRaw`
        INSERT INTO "shp_product_tags" ("product_id", "tag_id") VALUES (${productId}, ${tagId}) ON CONFLICT DO NOTHING
      `
    ),
  ])
}

export async function setProductCollections(productId: string, collectionIds: string[]): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM "shp_product_collections" WHERE "product_id" = ${productId}`,
    ...collectionIds.map(
      (collectionId, i) => prisma.$executeRaw`
        INSERT INTO "shp_product_collections" ("product_id", "collection_id", "position") VALUES (${productId}, ${collectionId}, ${i})
        ON CONFLICT DO NOTHING
      `
    ),
  ])
}

export async function getBackInStockSubscriberCounts(productIds: string[]): Promise<Record<string, { pending: number; fulfilled: number }>> {
  if (productIds.length === 0) return {}
  const rows = await prisma.$queryRaw<{ product_id: string; pending: bigint; fulfilled: bigint }[]>`
    SELECT "product_id",
      COUNT(*) FILTER (WHERE "notified_at" IS NULL)::bigint AS pending,
      COUNT(*) FILTER (WHERE "notified_at" IS NOT NULL)::bigint AS fulfilled
    FROM "shp_back_in_stock_subscriptions"
    WHERE "product_id" IN (${Prisma.join(productIds)})
    GROUP BY "product_id"
  `
  return Object.fromEntries(rows.map((r) => [r.product_id, { pending: Number(r.pending), fulfilled: Number(r.fulfilled) }]))
}
