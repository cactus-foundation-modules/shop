import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { MenuEntityKind, MenuEntitySearchResult, MenuEntityProvider, ResolvedMenuEntity } from '@/lib/modules/menu-entity-provider'
import { productHref } from '@/modules/shop/lib/product-url'
import { getProductUrlStyle } from '@/modules/shop/lib/product-url-server'

// Contributes to the "core.menu-entity-provider" extension point so the admin
// menu builder can link to shop content. URL scheme mirrors lib/sitemap.ts:
// /shop, /shop/products/{slug}, /shop/categories/{slug}, /shop/collections/{slug}.
const KINDS: MenuEntityKind[] = [
  { id: 'home', label: 'Shop home page' },
  { id: 'product', label: 'Product' },
  { id: 'category', label: 'Category' },
  { id: 'collection', label: 'Collection' },
]

function listKinds(): MenuEntityKind[] {
  return KINDS
}

async function searchEntities(kind: string, query: string): Promise<MenuEntitySearchResult[]> {
  const q = `%${query}%`
  if (kind === 'home') {
    return [{ id: 'home', label: 'Shop home page' }]
  }
  if (kind === 'product') {
    const rows = await prisma.$queryRaw<Array<{ id: string; name: string; status: string }>>`
      SELECT "id", "name", "status" FROM "shp_products" WHERE "name" ILIKE ${q} ORDER BY "created_at" DESC LIMIT 20
    `
    return rows.map((r) => ({ id: r.id, label: r.name, hint: r.status !== 'ACTIVE' ? r.status : undefined }))
  }
  if (kind === 'category') {
    const rows = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT "id", "name" FROM "shp_categories" WHERE "name" ILIKE ${q} ORDER BY "name" ASC LIMIT 20
    `
    return rows.map((r) => ({ id: r.id, label: r.name }))
  }
  if (kind === 'collection') {
    const rows = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT "id", "name" FROM "shp_collections" WHERE "name" ILIKE ${q} ORDER BY "name" ASC LIMIT 20
    `
    return rows.map((r) => ({ id: r.id, label: r.name }))
  }
  return []
}

async function resolveEntity(kind: string, id: string): Promise<ResolvedMenuEntity | null> {
  if (kind === 'home') {
    return { label: 'Shop', href: '/shop', publiclyVisible: true }
  }
  if (kind === 'product') {
    const rows = await prisma.$queryRaw<Array<{ name: string; slug: string; status: string }>>`
      SELECT "name", "slug", "status" FROM "shp_products" WHERE "id" = ${id} LIMIT 1
    `
    const product = rows[0]
    if (!product) return null
    // Only ACTIVE products render on the storefront; DRAFT/ARCHIVED are admin-only.
    // Resolved live per render, so flipping the product URL style re-points
    // every menu without anyone re-saving a menu.
    return { label: product.name, href: productHref(product.slug, await getProductUrlStyle()), publiclyVisible: product.status === 'ACTIVE' }
  }
  if (kind === 'category') {
    const rows = await prisma.$queryRaw<Array<{ name: string; slug: string }>>`SELECT "name", "slug" FROM "shp_categories" WHERE "id" = ${id} LIMIT 1`
    if (!rows[0]) return null
    return { label: rows[0].name, href: `/shop/categories/${rows[0].slug}`, publiclyVisible: true }
  }
  if (kind === 'collection') {
    const rows = await prisma.$queryRaw<Array<{ name: string; slug: string }>>`SELECT "name", "slug" FROM "shp_collections" WHERE "id" = ${id} LIMIT 1`
    if (!rows[0]) return null
    return { label: rows[0].name, href: `/shop/collections/${rows[0].slug}`, publiclyVisible: true }
  }
  return null
}

/**
 * Every id of one kind in a single query.
 *
 * The menu is resolved on every page render, and shop is what most of a shop's
 * menu points at - a header full of category links used to cost one
 * `WHERE id = $1` per link, run one after another. On the live install that made
 * shp_categories the most-scanned table in the database by a factor of twenty,
 * for a handful of names that could have come back together.
 *
 * The visibility rule per kind is unchanged: a category or collection is always
 * public, a product only when it is ACTIVE. Ids that match nothing are absent
 * from the map, which core reads exactly as it read a null before.
 */
async function resolveEntities(kind: string, ids: string[]): Promise<Map<string, ResolvedMenuEntity>> {
  const out = new Map<string, ResolvedMenuEntity>()
  const unique = [...new Set(ids)].filter(Boolean)
  if (unique.length === 0) return out

  if (kind === 'home') {
    for (const id of unique) out.set(id, { label: 'Shop', href: '/shop', publiclyVisible: true })
    return out
  }

  if (kind === 'product') {
    // The url style is one config read for the whole batch rather than one per
    // link - it is cached anyway, but asking once reads better.
    const [rows, style] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string; name: string; slug: string; status: string }>>`
        SELECT "id", "name", "slug", "status" FROM "shp_products" WHERE "id" IN (${Prisma.join(unique)})
      `,
      getProductUrlStyle(),
    ])
    for (const r of rows) {
      out.set(r.id, { label: r.name, href: productHref(r.slug, style), publiclyVisible: r.status === 'ACTIVE' })
    }
    return out
  }

  if (kind === 'category') {
    const rows = await prisma.$queryRaw<Array<{ id: string; name: string; slug: string }>>`
      SELECT "id", "name", "slug" FROM "shp_categories" WHERE "id" IN (${Prisma.join(unique)})
    `
    for (const r of rows) out.set(r.id, { label: r.name, href: `/shop/categories/${r.slug}`, publiclyVisible: true })
    return out
  }

  if (kind === 'collection') {
    const rows = await prisma.$queryRaw<Array<{ id: string; name: string; slug: string }>>`
      SELECT "id", "name", "slug" FROM "shp_collections" WHERE "id" IN (${Prisma.join(unique)})
    `
    for (const r of rows) out.set(r.id, { label: r.name, href: `/shop/collections/${r.slug}`, publiclyVisible: true })
    return out
  }

  return out
}

export const shopMenuEntityProvider: MenuEntityProvider = {
  moduleLabel: 'Shop',
  listKinds,
  searchEntities,
  resolveEntity,
  resolveEntities,
}
