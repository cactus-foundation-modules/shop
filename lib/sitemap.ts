import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db/prisma'
import { getShopConfigCached } from '@/modules/shop/lib/config'

// Active products, categories with products, and collections (spec 14.1) -
// getPublicSitemapEntries is the actual mechanism scanned by
// scripts/generate-module-router.mjs, not the spec's shopSitemapEntries name.
export async function getPublicSitemapEntries(siteUrl: string): Promise<MetadataRoute.Sitemap> {
  const shopConfig = await getShopConfigCached()
  if (shopConfig.shopStatus === 'CLOSED') return []

  const products = await prisma.$queryRaw<Array<{ slug: string; updated_at: Date }>>`
    SELECT "slug", "updated_at" FROM "shp_products" WHERE "status" = 'ACTIVE' AND "catalogue_hidden" = false
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
