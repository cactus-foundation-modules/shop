import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listProducts, getProductMedia, getProductCategoryIds, getProductTagIds, getProductCollectionIds } from '@/modules/shop/lib/db'
import { listCategories, listTags, listCollections } from '@/modules/shop/lib/db/catalogue'
import { getTaxClassCodesByIds } from '@/modules/shop/lib/db/tax-shipping'
import { buildExportCsv, collectPaged, serializeMedia, type CsvColumn } from '@/modules/shop/lib/csv'
import type { ShpProduct } from '@/modules/shop/lib/types'

export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const params = request.nextUrl.searchParams
  const status = (params.get('status') as never) ?? undefined
  const categorySlug = params.get('category') ?? undefined

  // Page through the whole catalogue: listProducts clamps perPage to 100 to
  // guard the public list, so asking for 10_000 only ever returned the first
  // page - silently exporting a fraction of a large shop. Paginate instead.
  const products = await collectPaged<ShpProduct>(async (page) => {
    // Variant children aren't standalone catalogue rows; they export via
    // Product options' own CSV, not the core product export.
    const { products: items, total } = await listProducts({ status, categorySlug, page, perPage: 100, excludeHidden: true })
    return { items, total }
  })

  const [categories, tags, collections] = await Promise.all([listCategories(), listTags(), listCollections()])
  const categoryById = new Map(categories.map((c) => [c.id, c.slug]))
  const tagById = new Map(tags.map((t) => [t.id, t.slug]))
  const collectionById = new Map(collections.map((c) => [c.id, c.slug]))
  const taxCodeById = await getTaxClassCodesByIds(products.map((p) => p.taxClassId).filter((id): id is string => !!id))

  const rows: Record<CsvColumn, string>[] = []
  for (const p of products) {
    const [media, categoryIds, tagIds, collectionIds] = await Promise.all([
      getProductMedia(p.id), getProductCategoryIds(p.id), getProductTagIds(p.id), getProductCollectionIds(p.id),
    ])
    const { imageUrls, imageAlt } = serializeMedia(media)
    rows.push({
      sku: p.sku ?? '', name: p.name, type: p.type, status: p.status, description: p.description ?? '',
      short_description: p.shortDescription ?? '', price: p.price, compare_at_price: p.compareAtPrice ?? '',
      cost_price: p.costPrice ?? '', tax_class: (p.taxClassId && taxCodeById.get(p.taxClassId)) || '',
      track_inventory: String(p.trackInventory), stock_count: p.stockCount != null ? String(p.stockCount) : '',
      low_stock_threshold: p.lowStockThreshold != null ? String(p.lowStockThreshold) : '', out_of_stock_behaviour: p.outOfStockBehaviour,
      weight: p.weight ?? '', weight_unit: p.weightUnit ?? '',
      categories: categoryIds.map((id) => categoryById.get(id)).filter(Boolean).join('|'),
      tags: tagIds.map((id) => tagById.get(id)).filter(Boolean).join('|'),
      collections: collectionIds.map((id) => collectionById.get(id)).filter(Boolean).join('|'),
      meta_title: p.metaTitle ?? '', meta_description: p.metaDescription ?? '',
      image_urls: imageUrls, image_alt: imageAlt, barcode: p.barcode ?? '',
    })
  }

  const csv = buildExportCsv(rows)
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="products-export.csv"' } })
}
