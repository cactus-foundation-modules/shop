import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { getPrimaryCategoryId } from '@/modules/shop/lib/db/products'
import type { ShpProduct } from '@/modules/shop/lib/types'

async function mapProductRows(rows: Record<string, unknown>[]): Promise<ShpProduct[]> {
  // One batched fetch, re-emitted in row order (the recommendation queries own
  // the ordering). A getProductById per row made a product's upsell strip cost
  // a round-trip per recommendation.
  const { getProductsByIds } = await import('@/modules/shop/lib/db/products')
  const byId = await getProductsByIds(rows.map((r) => r.id as string))
  return rows.map((r) => byId.get(r.id as string)).filter((p): p is ShpProduct => !!p)
}

export async function getManualRelatedProducts(productId: string): Promise<ShpProduct[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p."id" FROM "shp_related_products" rp JOIN "shp_products" p ON p."id" = rp."related_id"
    WHERE rp."product_id" = ${productId} ORDER BY rp."position" ASC
  `
  return mapProductRows(rows)
}

export async function getManualUpsellProducts(productId: string): Promise<ShpProduct[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p."id" FROM "shp_upsell_products" up JOIN "shp_products" p ON p."id" = up."upsell_id"
    WHERE up."product_id" = ${productId} ORDER BY up."position" ASC
  `
  return mapProductRows(rows)
}

export async function getAutoExcludedIds(productId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ excluded_id: string }[]>`SELECT "excluded_id" FROM "shp_auto_exclude_products" WHERE "product_id" = ${productId}`
  return rows.map((r) => r.excluded_id)
}

// Automatic-selection resolver (addendum D.3): primary category, active
// products only, excluding self + any per-product auto-exclusions, ordered by
// recency, capped at `limit`. No category = no fallback results.
//
// Every caller of this is a storefront strip, so the shop's out-of-stock hiding
// applies. It goes in the WHERE rather than over the results, so a strip asked
// for four still comes back with four when one of them has sold out.
export async function resolveAutomaticRecommendations(productId: string, limit: number): Promise<ShpProduct[]> {
  const categoryId = await getPrimaryCategoryId(productId)
  if (!categoryId) return []
  const excludedIds = await getAutoExcludedIds(productId)
  const excludeList = [productId, ...excludedIds]
  const { getStockGate, outOfStockSql } = await import('@/modules/shop/lib/stock-visibility')
  const inStockOnly = (await getStockGate()).hideFromLists
    ? Prisma.sql`AND NOT ${await outOfStockSql()}`
    : Prisma.empty

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p."id" FROM "shp_products" p
    JOIN "shp_product_categories" pc ON pc."product_id" = p."id"
    WHERE pc."category_id" = ${categoryId} AND p."status" = 'ACTIVE' AND p."id" NOT IN (${Prisma.join(excludeList)})
      ${inStockOnly}
    ORDER BY p."created_at" DESC
    LIMIT ${limit}
  `
  return mapProductRows(rows)
}

// A hand-picked list, with anything the shop is hiding taken out. Filtered
// before the limit is applied, so a strip of four that has one sold-out entry
// shows the next one down rather than a gap.
async function visibleRecommendations(products: ShpProduct[], limit?: number): Promise<ShpProduct[]> {
  const { filterHiddenOutOfStock } = await import('@/modules/shop/lib/stock-visibility')
  const visible = await filterHiddenOutOfStock(products)
  return limit == null ? visible : visible.slice(0, limit)
}

// Resolves related products for display: manual list if non-empty, else the
// automatic fallback when the product is in AUTOMATIC mode (addendum D.1).
export async function resolveRelatedProducts(product: ShpProduct): Promise<ShpProduct[]> {
  if (product.relatedMode === 'MANUAL') return visibleRecommendations(await getManualRelatedProducts(product.id))
  // Whether the owner has picked a list is decided on their list as they left
  // it, so a strip whose every pick has sold out stays their empty strip rather
  // than quietly turning into automatic suggestions.
  const manual = await getManualRelatedProducts(product.id)
  if (manual.length > 0) return visibleRecommendations(manual, product.relatedLimit)
  return resolveAutomaticRecommendations(product.id, product.relatedLimit)
}

export async function resolveUpsellProducts(product: ShpProduct): Promise<ShpProduct[]> {
  if (product.upsellMode === 'MANUAL') return visibleRecommendations(await getManualUpsellProducts(product.id))
  const manual = await getManualUpsellProducts(product.id)
  if (manual.length > 0) return visibleRecommendations(manual, product.upsellLimit)
  return resolveAutomaticRecommendations(product.id, product.upsellLimit)
}

// Upsells for a whole cart in one batched pass, keyed by source product id.
// Mirrors resolveUpsellProducts per product, but reads every manual link and
// every linked product in one query each instead of a per-product fan-out (the
// cart upsell strip used to fetch the entire catalogue and then walk each cart
// product's upsells one endpoint call at a time). Only products needing the
// automatic fallback still resolve individually, in parallel.
export async function resolveUpsellsForProducts(products: ShpProduct[]): Promise<Map<string, ShpProduct[]>> {
  const result = new Map<string, ShpProduct[]>()
  if (products.length === 0) return result

  const ids = products.map((p) => p.id)
  const linkRows = await prisma.$queryRaw<{ product_id: string; upsell_id: string }[]>`
    SELECT "product_id", "upsell_id" FROM "shp_upsell_products"
    WHERE "product_id" IN (${Prisma.join(ids)}) ORDER BY "position" ASC
  `
  const { getProductsByIds } = await import('@/modules/shop/lib/db/products')
  const upsellById = await getProductsByIds(linkRows.map((r) => r.upsell_id))

  const manualByProduct = new Map<string, ShpProduct[]>()
  for (const row of linkRows) {
    const target = upsellById.get(row.upsell_id)
    if (!target) continue
    const list = manualByProduct.get(row.product_id) ?? []
    list.push(target)
    manualByProduct.set(row.product_id, list)
  }

  await Promise.all(products.map(async (product) => {
    const manual = manualByProduct.get(product.id) ?? []
    if (product.upsellMode === 'MANUAL') {
      result.set(product.id, await visibleRecommendations(manual))
    } else if (manual.length > 0) {
      result.set(product.id, await visibleRecommendations(manual, product.upsellLimit))
    } else {
      result.set(product.id, await resolveAutomaticRecommendations(product.id, product.upsellLimit))
    }
  }))
  return result
}

export async function setRelatedProducts(productId: string, relatedIds: string[]): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM "shp_related_products" WHERE "product_id" = ${productId}`,
    ...relatedIds.map((relatedId, i) => prisma.$executeRaw`
      INSERT INTO "shp_related_products" ("product_id", "related_id", "position") VALUES (${productId}, ${relatedId}, ${i})
    `),
  ])
}

export async function setUpsellProducts(productId: string, upsellIds: string[]): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM "shp_upsell_products" WHERE "product_id" = ${productId}`,
    ...upsellIds.map((upsellId, i) => prisma.$executeRaw`
      INSERT INTO "shp_upsell_products" ("product_id", "upsell_id", "position") VALUES (${productId}, ${upsellId}, ${i})
    `),
  ])
}

export async function setAutoExcludedProducts(productId: string, excludedIds: string[]): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM "shp_auto_exclude_products" WHERE "product_id" = ${productId}`,
    ...excludedIds.map((excludedId) => prisma.$executeRaw`
      INSERT INTO "shp_auto_exclude_products" ("product_id", "excluded_id") VALUES (${productId}, ${excludedId})
    `),
  ])
}
