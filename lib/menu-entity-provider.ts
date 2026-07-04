import { prisma } from '@/lib/db/prisma'
import type { MenuEntityKind, MenuEntitySearchResult, MenuEntityProvider, ResolvedMenuEntity } from '@/lib/modules/menu-entity-provider'

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
    return { label: product.name, href: `/shop/products/${product.slug}`, publiclyVisible: product.status === 'ACTIVE' }
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

export const shopMenuEntityProvider: MenuEntityProvider = {
  moduleLabel: 'Shop',
  listKinds,
  searchEntities,
  resolveEntity,
}
