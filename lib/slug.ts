import { prisma } from '@/lib/db/prisma'
import { generateSlug } from '@/lib/utils'

// Generic unique-slug helper shared by products, categories, collections, and
// tags. Each lives at its own URL namespace (/shop/products/x,
// /shop/categories/x, ...) so there is no Gazette-style flat-namespace clash
// to reserve words against.
async function ensureUniqueSlugForTable(
  table: 'shp_products' | 'shp_categories' | 'shp_collections' | 'shp_tags',
  base: string,
  excludeId?: string
): Promise<string> {
  let slug = base || 'item'
  let suffix = 2
  for (;;) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "${table}" WHERE "slug" = $1 LIMIT 1`,
      slug
    )
    const clash = rows[0]
    if (!clash || clash.id === excludeId) return slug
    slug = `${base || 'item'}-${suffix}`
    suffix += 1
  }
}

export function slugify(name: string): string {
  return generateSlug(name)
}

export function ensureUniqueProductSlug(base: string, excludeId?: string): Promise<string> {
  return ensureUniqueSlugForTable('shp_products', base, excludeId)
}

export function ensureUniqueCategorySlug(base: string, excludeId?: string): Promise<string> {
  return ensureUniqueSlugForTable('shp_categories', base, excludeId)
}

export function ensureUniqueCollectionSlug(base: string, excludeId?: string): Promise<string> {
  return ensureUniqueSlugForTable('shp_collections', base, excludeId)
}

export function ensureUniqueTagSlug(base: string, excludeId?: string): Promise<string> {
  return ensureUniqueSlugForTable('shp_tags', base, excludeId)
}
