import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { getPrimaryCategoryId } from '@/modules/shop/lib/db/products'
import type { ShpProduct } from '@/modules/shop/lib/types'

async function mapProductRows(rows: Record<string, unknown>[]): Promise<ShpProduct[]> {
  const { getProductById } = await import('@/modules/shop/lib/db/products')
  const products = await Promise.all(rows.map((r) => getProductById(r.id as string)))
  return products.filter((p): p is ShpProduct => !!p)
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
// rating then recency, capped at `limit`. No category = no fallback results.
export async function resolveAutomaticRecommendations(productId: string, limit: number): Promise<ShpProduct[]> {
  const categoryId = await getPrimaryCategoryId(productId)
  if (!categoryId) return []
  const excludedIds = await getAutoExcludedIds(productId)
  const excludeList = [productId, ...excludedIds]

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p."id" FROM "shp_products" p
    JOIN "shp_product_categories" pc ON pc."product_id" = p."id"
    WHERE pc."category_id" = ${categoryId} AND p."status" = 'ACTIVE' AND p."id" NOT IN (${Prisma.join(excludeList)})
    ORDER BY p."rating_average" DESC NULLS LAST, p."created_at" DESC
    LIMIT ${limit}
  `
  return mapProductRows(rows)
}

// Resolves related products for display: manual list if non-empty, else the
// automatic fallback when the product is in AUTOMATIC mode (addendum D.1).
export async function resolveRelatedProducts(product: ShpProduct): Promise<ShpProduct[]> {
  if (product.relatedMode === 'MANUAL') return getManualRelatedProducts(product.id)
  const manual = await getManualRelatedProducts(product.id)
  if (manual.length > 0) return manual.slice(0, product.relatedLimit)
  return resolveAutomaticRecommendations(product.id, product.relatedLimit)
}

export async function resolveUpsellProducts(product: ShpProduct): Promise<ShpProduct[]> {
  if (product.upsellMode === 'MANUAL') return getManualUpsellProducts(product.id)
  const manual = await getManualUpsellProducts(product.id)
  if (manual.length > 0) return manual.slice(0, product.upsellLimit)
  return resolveAutomaticRecommendations(product.id, product.upsellLimit)
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
