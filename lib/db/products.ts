import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { notifyProductSaved } from '@/modules/shop/lib/product-saved'
import type { PuckData, ShpProduct, ShpProductMedia, ShpProductStatus, ShpProductType } from '@/modules/shop/lib/types'

function mapProduct(r: Record<string, unknown>): ShpProduct {
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    type: r.type as ShpProductType,
    status: r.status as ShpProductStatus,
    description: (r.description as string | null) ?? null,
    descriptionPuck: (r.description_puck as PuckData | null) ?? null,
    shortDescription: (r.short_description as string | null) ?? null,
    sku: (r.sku as string | null) ?? null,
    saleSku: (r.sale_sku as string | null) ?? null,
    barcode: (r.barcode as string | null) ?? null,
    supplier: (r.supplier as string | null) ?? null,
    price: (r.price as { toString(): string }).toString(),
    salePrice: r.sale_price != null ? (r.sale_price as { toString(): string }).toString() : null,
    retailPrice: r.retail_price != null ? (r.retail_price as { toString(): string }).toString() : null,
    tradePrice: r.trade_price != null ? (r.trade_price as { toString(): string }).toString() : null,
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
    popularitySeed: (r.popularity_seed as number | null) ?? null,
    popularity: (r.popularity as number | null) ?? null,
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

// Bulk match by id, keyed by id. One query for a whole cart instead of a
// getProductById round-trip per line - the cart validate / checkout resolve path
// walks every line and used to fetch each product on its own. Duplicate ids
// (two personalised lines of the same product) collapse to one row.
export async function getProductsByIds(ids: string[]): Promise<Map<string, ShpProduct>> {
  const map = new Map<string, ShpProduct>()
  const unique = [...new Set(ids)].filter(Boolean)
  if (unique.length === 0) return map
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_products" WHERE "id" IN (${Prisma.join(unique)})
  `
  for (const r of rows) {
    const p = mapProduct(r)
    map.set(p.id, p)
  }
  return map
}

export async function getProductBySlug(slug: string): Promise<ShpProduct | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_products" WHERE "slug" = ${slug} LIMIT 1`
  return rows[0] ? mapProduct(rows[0]) : null
}

// Bulk match for the CSV importer: one query for every SKU the sheet carries,
// keyed by SKU, so a re-import doesn't fire a lookup per row. First row wins on
// the (unexpected) chance two products share a SKU, matching the old per-row
// LIMIT 1 lookup.
export async function getProductsBySkus(skus: string[]): Promise<Map<string, ShpProduct>> {
  const map = new Map<string, ShpProduct>()
  if (skus.length === 0) return map
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_products" WHERE "sku" IN (${Prisma.join(skus)})
  `
  for (const r of rows) {
    const p = mapProduct(r)
    if (p.sku && !map.has(p.sku)) map.set(p.sku, p)
  }
  return map
}

// Bulk match by slug for the SKU-less rows. catalogue_hidden = false keeps a
// name clash with a hidden variant child from hijacking the row, exactly as the
// per-row lookup did.
export async function getProductsBySlugs(slugs: string[]): Promise<Map<string, ShpProduct>> {
  const map = new Map<string, ShpProduct>()
  if (slugs.length === 0) return map
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_products" WHERE "slug" IN (${Prisma.join(slugs)}) AND "catalogue_hidden" = false
  `
  for (const r of rows) {
    const p = mapProduct(r)
    if (!map.has(p.slug)) map.set(p.slug, p)
  }
  return map
}

export async function getProductMedia(productId: string): Promise<ShpProductMedia[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_product_media" WHERE "product_id" = ${productId} ORDER BY "position" ASC
  `
  return rows.map(mapMedia)
}

// Every product's media in one query, grouped by product id and kept in position
// order within each product (matching getProductMedia). Lets the cart pick each
// line's primary image without a media round-trip per line.
export async function getProductMediaForProducts(productIds: string[]): Promise<Map<string, ShpProductMedia[]>> {
  const map = new Map<string, ShpProductMedia[]>()
  const unique = [...new Set(productIds)].filter(Boolean)
  if (unique.length === 0) return map
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_product_media" WHERE "product_id" IN (${Prisma.join(unique)}) ORDER BY "position" ASC
  `
  for (const r of rows) {
    const media = mapMedia(r)
    const list = map.get(media.productId) ?? []
    list.push(media)
    map.set(media.productId, list)
  }
  return map
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

// The batched twins of the three lookups above, grouped by product id and in the
// same order within each product. A caller working over the WHOLE catalogue - the
// CSV export, and the Google Sheet mirror that shares it - asked for these one
// product at a time, which on a real shop is four round trips per product and
// most of a catalogue's export time. Measured on a 445-product catalogue: two
// minutes of the export was these three plus the media read, taken one product
// after another. Batched, it is four queries for the lot.
//
// Each returns a Map missing the products that have no rows, so a caller reads
// `map.get(id) ?? []` exactly as the single-product versions returned [].
export async function getProductCategoryIdsForProducts(productIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  const unique = [...new Set(productIds)].filter(Boolean)
  if (unique.length === 0) return map
  const rows = await prisma.$queryRaw<{ product_id: string; category_id: string }[]>`
    SELECT "product_id", "category_id" FROM "shp_product_categories" WHERE "product_id" IN (${Prisma.join(unique)})
  `
  for (const r of rows) {
    const list = map.get(r.product_id) ?? []
    list.push(r.category_id)
    map.set(r.product_id, list)
  }
  return map
}

export async function getProductTagIdsForProducts(productIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  const unique = [...new Set(productIds)].filter(Boolean)
  if (unique.length === 0) return map
  const rows = await prisma.$queryRaw<{ product_id: string; tag_id: string }[]>`
    SELECT "product_id", "tag_id" FROM "shp_product_tags" WHERE "product_id" IN (${Prisma.join(unique)})
  `
  for (const r of rows) {
    const list = map.get(r.product_id) ?? []
    list.push(r.tag_id)
    map.set(r.product_id, list)
  }
  return map
}

export async function getProductCollectionIdsForProducts(productIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  const unique = [...new Set(productIds)].filter(Boolean)
  if (unique.length === 0) return map
  // Position order is preserved within each product, matching the single-product
  // version - collections are shown in the order the shop put them in.
  const rows = await prisma.$queryRaw<{ product_id: string; collection_id: string }[]>`
    SELECT "product_id", "collection_id" FROM "shp_product_collections"
    WHERE "product_id" IN (${Prisma.join(unique)}) ORDER BY "position" ASC
  `
  for (const r of rows) {
    const list = map.get(r.product_id) ?? []
    list.push(r.collection_id)
    map.set(r.product_id, list)
  }
  return map
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

// Stock states for the admin filter. 'in' = tracked and above the low
// threshold; 'low' = tracked, at or below the threshold but not yet empty;
// 'out' = tracked and empty. Untracked products match none of these.
export type ProductStockFilter = 'in' | 'low' | 'out'

// Whitelist of admin list orderings. Kept as a fixed map (never interpolated
// from the request) so the ORDER BY can never carry user input into SQL.
export type ProductSort = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc' | 'stock-asc' | 'stock-desc' | 'popular'

const SORT_SQL: Record<ProductSort, Prisma.Sql> = {
  newest: Prisma.sql`p."created_at" DESC`,
  oldest: Prisma.sql`p."created_at" ASC`,
  'name-asc': Prisma.sql`p."name" ASC`,
  'name-desc': Prisma.sql`p."name" DESC`,
  // Sort on what the shopper is actually charged, so a product on offer sorts
  // where its offer price puts it rather than where its old price did. Matches
  // effectivePrice() in lib/pricing.ts: a sale price only counts when it's
  // genuinely below the normal price.
  'price-asc': Prisma.sql`(CASE WHEN p."sale_price" IS NOT NULL AND p."sale_price" < p."price" THEN p."sale_price" ELSE p."price" END) ASC`,
  'price-desc': Prisma.sql`(CASE WHEN p."sale_price" IS NOT NULL AND p."sale_price" < p."price" THEN p."sale_price" ELSE p."price" END) DESC`,
  'stock-asc': Prisma.sql`p."stock_count" ASC NULLS FIRST`,
  'stock-desc': Prisma.sql`p."stock_count" DESC NULLS LAST`,
  // Best sellers first, unranked products last (lib/popularity.ts recomputes the
  // figure nightly). A product nobody has ranked sorts below one ranked bottom of
  // the pile: "we don't know" is not the same claim as "it sells badly".
  popular: Prisma.sql`p."popularity" DESC NULLS LAST`,
}

// Split a search box entry into words so "evolve screen" finds
// "Evolve / Impulse Plus Bench Screen". Every word must appear (in name or
// SKU) but order and what sits between them does not matter. Capped so a
// pasted paragraph cannot build an unbounded query.
export function searchTerms(raw: string): string[] {
  return raw.trim().split(/\s+/).filter(Boolean).slice(0, 8)
}

// What `perPage` is clamped to when the caller does not say otherwise - the
// figure every caller got before maxPerPage existed, kept so adding the option
// moves nothing.
export const DEFAULT_MAX_PER_PAGE = 100
// The ceiling on the ceiling. A storefront grid may ask for a whole category,
// which on a real catalogue runs to a few hundred; it may not ask for the whole
// shop. Deskwell's largest rolled-up category is 217, so this leaves room
// without ever letting one page render twenty thousand cards.
export const HARD_MAX_PER_PAGE = 500

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
  stock?: ProductStockFilter
  sort?: ProductSort
  // Exclude catalogue-hidden rows (the variant child products). The public
  // grid, search and admin product list pass true; variations' own queries
  // pass false to reach the children.
  excludeHidden?: boolean
  // The ceiling `perPage` is clamped to. Defaults to DEFAULT_MAX_PER_PAGE, which
  // is what every caller got before this existed, so nothing moves by adding it.
  //
  // It exists because the 100 ceiling is doing two different jobs badly. Against
  // the unauthenticated public list it is a DoS guard, and must stay. Against a
  // storefront grid it is a silent truncation: a shop owner sets a category grid
  // to 300, the query quietly returns 100, and the other 200 products cannot be
  // reached from anywhere on the site. The difference is where `perPage` came
  // from - an untrusted query string, or a layout the owner authored - and only
  // the caller knows which. So the caller says.
  //
  // Still clamped, at HARD_MAX_PER_PAGE: "trusted" means the number came from
  // the shop's own settings, not that it should be allowed to be a million.
  maxPerPage?: number
  // This list is being shown to a visitor, so the shop's out-of-stock hiding
  // applies to it (lib/stock-visibility.ts). Every storefront list passes true;
  // the admin product list and the CSV export never do, because the screen you
  // go to in order to reorder something is a poor place to hide it. Costs
  // nothing on a shop that hides nothing.
  storefront?: boolean
}

export async function listProducts(filter: ListProductsFilter): Promise<{ products: ShpProduct[]; total: number }> {
  // Clamp pagination centrally: guards against NaN/negative/huge perPage from
  // the unauthenticated public list (LIMIT NaN 500s; perPage=1e9 is a DoS).
  // See `maxPerPage` above for why the ceiling is a parameter rather than 100.
  const ceiling = Math.min(
    HARD_MAX_PER_PAGE,
    Math.max(1, Math.floor(Number(filter.maxPerPage)) || DEFAULT_MAX_PER_PAGE),
  )
  const page = Math.max(1, Math.floor(Number(filter.page)) || 1)
  const perPage = Math.min(ceiling, Math.max(1, Math.floor(Number(filter.perPage)) || 24))
  const offset = (page - 1) * perPage

  const conditions: Prisma.Sql[] = []
  if (filter.status) conditions.push(Prisma.sql`p."status" = ${filter.status}`)
  if (filter.type) conditions.push(Prisma.sql`p."type" = ${filter.type}`)
  if (filter.preOrder) conditions.push(Prisma.sql`p."is_pre_order" = true`)
  if (filter.stock === 'out') conditions.push(Prisma.sql`(p."track_inventory" = true AND COALESCE(p."stock_count", 0) <= 0)`)
  if (filter.stock === 'low') conditions.push(Prisma.sql`(p."track_inventory" = true AND p."low_stock_threshold" IS NOT NULL AND p."stock_count" IS NOT NULL AND p."stock_count" > 0 AND p."stock_count" <= p."low_stock_threshold")`)
  if (filter.stock === 'in') conditions.push(Prisma.sql`(p."track_inventory" = true AND p."stock_count" IS NOT NULL AND p."stock_count" > 0 AND (p."low_stock_threshold" IS NULL OR p."stock_count" > p."low_stock_threshold"))`)
  if (filter.excludeHidden) conditions.push(Prisma.sql`p."catalogue_hidden" = false`)
  if (filter.storefront) {
    // In the WHERE rather than filtered out of the rows afterwards, so a page of
    // 24 is 24 products and the total underneath it counts the same ones.
    const { getStockGate, outOfStockSql } = await import('@/modules/shop/lib/stock-visibility')
    if ((await getStockGate()).hideFromLists) conditions.push(Prisma.sql`NOT ${await outOfStockSql()}`)
  }
  if (filter.search) {
    const terms = searchTerms(filter.search)
    if (terms.length) {
      // Name and SKU, plus whatever a companion module says counts as a match -
      // shop-variations answers with its hidden children's SKUs, so a variation
      // code finds the listing it belongs to. Imported here rather than at the
      // top of the file so the generated extension-point registry is only pulled
      // in by a query that actually searches (lib/product-search.ts).
      const { productSearchSql } = await import('@/modules/shop/lib/product-search')
      const searchSql = await productSearchSql(terms)
      if (searchSql) conditions.push(searchSql)
    }
  }
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
    // An automatic tag ("On Sale") has no rows in shp_product_tags at all - its
    // membership is the rule, worked out here so the page stays one query and
    // its count agrees with its rows. Imported inside the branch so a list that
    // is not filtered by tag never pulls in the extension-point registry.
    const { tagAutoRule } = await import('@/modules/shop/lib/db/catalogue')
    const rule = await tagAutoRule(filter.tagSlug)
    if (rule === 'sale') {
      const { productOnSaleSql } = await import('@/modules/shop/lib/product-sale')
      const saleSql = await productOnSaleSql()
      // Sale prices switched off shop-wide means nothing is reduced. An empty
      // list is the honest answer; matching everything would be a lie.
      conditions.push(saleSql ?? Prisma.sql`false`)
    } else {
      conditions.push(Prisma.sql`p."id" IN (
        SELECT "product_id" FROM "shp_product_tags" pt
        JOIN "shp_tags" t ON t."id" = pt."tag_id"
        WHERE t."slug" = ${filter.tagSlug}
      )`)
    }
  }
  if (filter.collectionSlug) {
    conditions.push(Prisma.sql`p."id" IN (
      SELECT "product_id" FROM "shp_product_collections" pcol
      JOIN "shp_collections" col ON col."id" = pcol."collection_id"
      WHERE col."slug" = ${filter.collectionSlug}
    )`)
  }

  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty

  const orderBy = SORT_SQL[filter.sort ?? 'newest'] ?? SORT_SQL.newest
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT p.* FROM "shp_products" p ${where}
    ORDER BY ${orderBy}, p."id" DESC
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
  saleSku?: string | null
  barcode?: string | null
  supplier?: string | null
  price: number
  salePrice?: number | null
  retailPrice?: number | null
  tradePrice?: number | null
  costPrice?: number | null
  taxClassId?: string | null
  trackInventory?: boolean
  stockCount?: number | null
  lowStockThreshold?: number | null
  outOfStockBehaviour?: ShpProduct['outOfStockBehaviour']
  weight?: number | null
  // Everything below was accepted by callers (the CSV importer passes it) but
  // never made it into the INSERT, so a newly imported product silently lost its
  // weight unit, meta title/description and the rest until someone re-saved it
  // in the admin.
  weightUnit?: string | null
  dimensionL?: number | null
  dimensionW?: number | null
  dimensionH?: number | null
  dimensionUnit?: string | null
  downloadLimit?: number | null
  downloadExpiry?: number | null
  metaTitle?: string | null
  metaDescription?: string | null
  isPreOrder?: boolean
  preOrderDispatchDate?: Date | null
  preOrderNote?: string | null
  preOrderMaxQuantity?: number | null
  relatedMode?: ShpProduct['relatedMode']
  upsellMode?: ShpProduct['upsellMode']
  relatedLimit?: number | null
  upsellLimit?: number | null
  // Create the row hidden from the catalogue (used for variation child products).
  catalogueHidden?: boolean
}

export async function createProduct(data: CreateProductInput): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_products" (
      "name", "slug", "type", "status", "description", "short_description", "sku", "sale_sku", "barcode", "supplier",
      "price", "sale_price", "retail_price", "trade_price", "cost_price", "tax_class_id",
      "track_inventory", "stock_count", "low_stock_threshold", "out_of_stock_behaviour",
      "weight", "weight_unit", "dimension_l", "dimension_w", "dimension_h", "dimension_unit",
      "download_limit", "download_expiry", "meta_title", "meta_description",
      "is_pre_order", "pre_order_dispatch_date", "pre_order_note", "pre_order_max_quantity",
      "related_mode", "upsell_mode", "related_limit", "upsell_limit", "catalogue_hidden"
    ) VALUES (
      ${data.name}, ${data.slug}, ${data.type}, ${data.status ?? 'DRAFT'}, ${data.description ?? null}, ${data.shortDescription ?? null}, ${data.sku ?? null}, ${data.saleSku ?? null}, ${data.barcode ?? null}, ${data.supplier ?? null},
      ${data.price}, ${data.salePrice ?? null}, ${data.retailPrice ?? null}, ${data.tradePrice ?? null}, ${data.costPrice ?? null}, ${data.taxClassId ?? null},
      ${data.trackInventory ?? false}, ${data.stockCount ?? null}, ${data.lowStockThreshold ?? null}, ${data.outOfStockBehaviour ?? 'BLOCK'},
      ${data.weight ?? null}, ${data.weightUnit ?? null}, ${data.dimensionL ?? null}, ${data.dimensionW ?? null}, ${data.dimensionH ?? null}, ${data.dimensionUnit ?? null},
      ${data.downloadLimit ?? null}, ${data.downloadExpiry ?? null}, ${data.metaTitle ?? null}, ${data.metaDescription ?? null},
      ${data.isPreOrder ?? false}, ${data.preOrderDispatchDate ?? null}, ${data.preOrderNote ?? null}, ${data.preOrderMaxQuantity ?? null},
      ${data.relatedMode ?? 'AUTOMATIC'}, ${data.upsellMode ?? 'AUTOMATIC'}, ${data.relatedLimit ?? 4}, ${data.upsellLimit ?? 4}, ${data.catalogueHidden ?? false}
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
  descriptionPuck: PuckData | null
  shortDescription: string | null
  sku: string | null
  saleSku: string | null
  barcode: string | null
  supplier: string | null
  price: number
  salePrice: number | null
  retailPrice: number | null
  tradePrice: number | null
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

// descriptionPuck is jsonb and needs an explicit ::jsonb cast, so it is set by a
// dedicated fragment in updateProduct rather than the generic assignment below.
const COLUMN_MAP: Record<Exclude<keyof UpdateProductInput, 'descriptionPuck'>, string> = {
  name: 'name', slug: 'slug', status: 'status', description: 'description', shortDescription: 'short_description',
  sku: 'sku', saleSku: 'sale_sku', barcode: 'barcode', supplier: 'supplier', price: 'price', salePrice: 'sale_price', retailPrice: 'retail_price', tradePrice: 'trade_price', costPrice: 'cost_price',
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
  const written: string[] = []
  // jsonb column: the generic assignment below can't cast a JS value to jsonb,
  // so stringify and cast explicitly (same idiom as tax-shipping/import-jobs).
  if (fields.descriptionPuck !== undefined) {
    sets.push(Prisma.sql`"description_puck" = ${fields.descriptionPuck ? JSON.stringify(fields.descriptionPuck) : null}::jsonb`)
    written.push('descriptionPuck')
  }
  for (const key of Object.keys(fields) as (keyof UpdateProductInput)[]) {
    if (key === 'descriptionPuck') continue
    const value = fields[key]
    if (value === undefined) continue
    const column = COLUMN_MAP[key]
    sets.push(Prisma.sql`${Prisma.raw(`"${column}"`)} = ${value}`)
    written.push(key)
  }
  if (sets.length === 0) return
  sets.push(Prisma.sql`"updated_at" = CURRENT_TIMESTAMP`)
  // Any stock count change re-arms the low-stock cron dedupe marker - a fresh
  // restock (or a further drop) should be eligible for its own alert.
  if ('stockCount' in fields) sets.push(Prisma.sql`"low_stock_alerted_at" = NULL`)
  await prisma.$executeRaw`UPDATE "shp_products" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${id}`
  // Let any module keeping its own rows in step with this product know what
  // moved (see lib/product-saved). Awaited so a listener's write lands before
  // the caller reads the product back, and swallowing its own failures so a
  // listener can never lose the owner's edit.
  await notifyProductSaved(id, written)
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

// The counterpart to incrementPreOrderCount, for a pre-order that is cancelled
// or refunded. Without it the allocation only ever runs one way: a cancelled
// pre-order kept its slot forever, and once pre_order_count had touched the cap
// the auto-flip above left is_pre_order = false permanently, quietly taking the
// product out of pre-order mode even though nobody was actually waiting on
// those units.
//
// One statement, so it is safe to repeat and cannot leave the counter and the
// flag disagreeing. Every column on the right-hand side reads the pre-update
// row, which is what makes the re-enable condition legible: "the count was at
// or above the cap before this release, and is below it after".
//
// GREATEST(...,0) means a double call clamps instead of going negative, but the
// counter is still only correct if callers release each unit once - the status
// route gates on a genuine transition, and the cancel path releases only the
// units that have not already been released by a refund.
//
// Re-enabling is deliberately narrow. It fires only when the product was sitting
// at its cap, which is precisely the state incrementPreOrderCount creates, so a
// product the owner switched off by hand while it was below its cap is never
// switched back on. A product with no cap is never re-enabled either - nothing
// auto-disabled it, so the flag is the owner's and stays the owner's.
export async function decrementPreOrderCount(productId: string, qty: number): Promise<void> {
  if (qty <= 0) return
  await prisma.$executeRaw`
    UPDATE "shp_products" SET
      "pre_order_count" = GREATEST("pre_order_count" - ${qty}, 0),
      "is_pre_order" = CASE
        WHEN "is_pre_order" = false
         AND "pre_order_max_quantity" IS NOT NULL
         AND "pre_order_count" >= "pre_order_max_quantity"
         AND GREATEST("pre_order_count" - ${qty}, 0) < "pre_order_max_quantity"
        THEN true
        ELSE "is_pre_order"
      END,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${productId}
  `
}

export async function decrementStockOnShip(orderItemIds: string[]): Promise<void> {
  if (orderItemIds.length === 0) return
  // Aggregate the ordered quantity per product FIRST, then join that one row per
  // product to the product row. A plain join to shp_order_items applies the
  // UPDATE only once per product even when several order-item rows point at the
  // same product (a personalised cart deliberately allows two lines of the same
  // product), so an order of qty 1 + qty 3 of one product would decrement by 3,
  // not 4, and silently oversell. Summing first decrements by the true total
  // exactly once.
  await prisma.$executeRaw`
    UPDATE "shp_products" p SET "stock_count" = GREATEST(COALESCE(p."stock_count", 0) - agg."ordered_qty", 0)
    FROM (
      SELECT oi."product_id" AS product_id, SUM(oi."quantity")::int AS ordered_qty
      FROM "shp_order_items" oi
      WHERE oi."id" IN (${Prisma.join(orderItemIds)}) AND oi."product_id" IS NOT NULL
      GROUP BY oi."product_id"
    ) agg
    WHERE agg."product_id" = p."id" AND p."track_inventory" = true
  `
}

export async function deleteProduct(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_products" WHERE "id" = ${id}`
}

// Delete several products at once. Order-line history survives (the
// shp_order_items FK is ON DELETE SET NULL); media, categories, tags,
// collections, back-in-stock subs and recommendation links cascade.
export async function bulkDeleteProducts(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  return prisma.$executeRaw`DELETE FROM "shp_products" WHERE "id" IN (${Prisma.join(ids)})`
}

export async function bulkSetProductStatus(ids: string[], status: ShpProductStatus): Promise<number> {
  if (ids.length === 0) return 0
  return prisma.$executeRaw`
    UPDATE "shp_products" SET "status" = ${status}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" IN (${Prisma.join(ids)})
  `
}

// One representative image per product for the admin list thumbnails. Prefers
// the primary image, else the lowest-position one; videos are ignored so a
// thumbnail is always a still. Batched so the list is a single extra query.
export async function getPrimaryProductImages(productIds: string[]): Promise<Record<string, string>> {
  if (productIds.length === 0) return {}
  const rows = await prisma.$queryRaw<{ product_id: string; url: string }[]>`
    SELECT DISTINCT ON ("product_id") "product_id", "url"
    FROM "shp_product_media"
    WHERE "product_id" IN (${Prisma.join(productIds)}) AND "type" = 'IMAGE'
    ORDER BY "product_id", "is_primary" DESC, "position" ASC
  `
  return Object.fromEntries(rows.map((r) => [r.product_id, r.url]))
}

// Clone a product into a fresh DRAFT with a new name/slug and no SKU (SKUs are
// unique). The sale SKU does come across, along with the sale price it belongs
// with - it is the supplier's code, not the shop's identity, and is not unique.
// Copies media, category/tag/collection membership and the manual
// recommendation lists. catalogue_hidden is omitted from the INSERT so the copy
// defaults to visible - a duplicate is a real product, never a variant child.
// Returns the new id, or null if the source is gone.
export async function duplicateProduct(sourceId: string, next: { name: string; slug: string }): Promise<{ id: string } | null> {
  const created = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "shp_products" (
      "name", "slug", "type", "status", "description", "short_description", "sku", "sale_sku", "barcode", "supplier",
      "price", "sale_price", "retail_price", "trade_price", "cost_price", "tax_class_id",
      "track_inventory", "stock_count", "low_stock_threshold", "out_of_stock_behaviour",
      "weight", "weight_unit", "dimension_l", "dimension_w", "dimension_h", "dimension_unit",
      "digital_file_id", "download_limit", "download_expiry",
      "meta_title", "meta_description", "og_image_id", "master_category_id",
      "is_pre_order", "pre_order_dispatch_date", "pre_order_note", "pre_order_max_quantity",
      "related_mode", "upsell_mode", "related_limit", "upsell_limit"
    )
    SELECT
      ${next.name}, ${next.slug}, "type", 'DRAFT', "description", "short_description", NULL, "sale_sku", "barcode", "supplier",
      "price", "sale_price", "retail_price", "trade_price", "cost_price", "tax_class_id",
      "track_inventory", "stock_count", "low_stock_threshold", "out_of_stock_behaviour",
      "weight", "weight_unit", "dimension_l", "dimension_w", "dimension_h", "dimension_unit",
      "digital_file_id", "download_limit", "download_expiry",
      "meta_title", "meta_description", "og_image_id", "master_category_id",
      "is_pre_order", "pre_order_dispatch_date", "pre_order_note", "pre_order_max_quantity",
      "related_mode", "upsell_mode", "related_limit", "upsell_limit"
    FROM "shp_products" WHERE "id" = ${sourceId}
    RETURNING "id"
  `
  const newId = created[0]?.id
  if (!newId) return null

  await prisma.$transaction([
    prisma.$executeRaw`
      INSERT INTO "shp_product_media" ("product_id", "type", "url", "alt_text", "position", "is_primary")
      SELECT ${newId}, "type", "url", "alt_text", "position", "is_primary" FROM "shp_product_media" WHERE "product_id" = ${sourceId}
    `,
    prisma.$executeRaw`
      INSERT INTO "shp_product_categories" ("product_id", "category_id")
      SELECT ${newId}, "category_id" FROM "shp_product_categories" WHERE "product_id" = ${sourceId}
    `,
    prisma.$executeRaw`
      INSERT INTO "shp_product_tags" ("product_id", "tag_id")
      SELECT ${newId}, "tag_id" FROM "shp_product_tags" WHERE "product_id" = ${sourceId}
    `,
    prisma.$executeRaw`
      INSERT INTO "shp_product_collections" ("product_id", "collection_id", "position")
      SELECT ${newId}, "collection_id", "position" FROM "shp_product_collections" WHERE "product_id" = ${sourceId}
    `,
    prisma.$executeRaw`
      INSERT INTO "shp_related_products" ("product_id", "related_id", "position")
      SELECT ${newId}, "related_id", "position" FROM "shp_related_products" WHERE "product_id" = ${sourceId}
    `,
    prisma.$executeRaw`
      INSERT INTO "shp_upsell_products" ("product_id", "upsell_id", "position")
      SELECT ${newId}, "upsell_id", "position" FROM "shp_upsell_products" WHERE "product_id" = ${sourceId}
    `,
    prisma.$executeRaw`
      INSERT INTO "shp_auto_exclude_products" ("product_id", "excluded_id")
      SELECT ${newId}, "excluded_id" FROM "shp_auto_exclude_products" WHERE "product_id" = ${sourceId}
    `,
  ])
  return { id: newId }
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
