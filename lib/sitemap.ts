import type { MetadataRoute } from 'next'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { hidesOutOfStockFromShoppers, outOfStockSql } from '@/modules/shop/lib/stock-visibility'

// Active products, categories with products, and collections (spec 14.1) -
// getPublicSitemapEntries is the actual mechanism scanned by
// scripts/generate-module-router.mjs, not the spec's shopSitemapEntries name.
export async function getPublicSitemapEntries(siteUrl: string): Promise<MetadataRoute.Sitemap> {
  const shopConfig = await getShopConfigCached()
  if (shopConfig.shopStatus === 'CLOSED') return []

  // A sitemap is one file served to the whole world, so it takes the shopper's
  // answer and never the staff exemption: listing the URLs of products the shop
  // is hiding would hand search engines the very thing the setting withholds.
  // A shop hiding lists only keeps the pages themselves live, but an unlisted
  // product has no business being advertised for indexing either.
  const inStockOnly = hidesOutOfStockFromShoppers(shopConfig)
    ? Prisma.sql`AND NOT ${await outOfStockSql()}`
    : Prisma.empty
  const products = await prisma.$queryRaw<Array<{ slug: string; updated_at: Date }>>`
    SELECT p."slug", p."updated_at" FROM "shp_products" p
    WHERE p."status" = 'ACTIVE' AND p."catalogue_hidden" = false ${inStockOnly}
  `
  const categories = await prisma.$queryRaw<Array<{ slug: string; updated_at: Date }>>`
    SELECT c."slug", c."updated_at" FROM "shp_categories" c
    WHERE EXISTS (SELECT 1 FROM "shp_product_categories" pc WHERE pc."category_id" = c."id")
  `
  const collections = await prisma.$queryRaw<Array<{ slug: string; updated_at: Date }>>`
    SELECT col."slug", col."updated_at" FROM "shp_collections" col
    WHERE EXISTS (SELECT 1 FROM "shp_product_collections" pc WHERE pc."collection_id" = col."id")
  `

  return [
    { url: `${siteUrl}/shop`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
    ...products.map((p) => ({ url: `${siteUrl}/shop/products/${p.slug}`, lastModified: p.updated_at, changeFrequency: 'weekly' as const, priority: 0.6 })),
    ...categories.map((c) => ({ url: `${siteUrl}/shop/categories/${c.slug}`, lastModified: c.updated_at, changeFrequency: 'weekly' as const, priority: 0.5 })),
    ...collections.map((c) => ({ url: `${siteUrl}/shop/collections/${c.slug}`, lastModified: c.updated_at, changeFrequency: 'weekly' as const, priority: 0.5 })),
  ]
}
