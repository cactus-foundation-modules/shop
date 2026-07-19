import { listProducts, getProductMedia, getProductCategoryIds, getProductTagIds, getProductCollectionIds } from '@/modules/shop/lib/db'
import { listCategories, listTags, listCollections } from '@/modules/shop/lib/db/catalogue'
import { getTaxClassCodesByIds } from '@/modules/shop/lib/db/tax-shipping'
import { collectPaged, serializeMedia, type CsvColumn } from '@/modules/shop/lib/csv'
import type { ShpProduct, ShpProductStatus } from '@/modules/shop/lib/types'

export type ProductCsvRow = Record<CsvColumn, string>

function num(value: string | number | null | undefined): string {
  return value == null ? '' : String(value)
}

// Dates go out as plain YYYY-MM-DD. A spreadsheet owner types dates that way,
// and it is what the importer parses back - a full ISO timestamp round-trips
// through Sheets as a serial number and comes back unrecognisable.
function isoDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : ''
}

// One place that turns products into CSV rows, shared by the shop's own export
// route and the Google-Sheet mirror's Push. They were two hand-maintained copies
// of the same object literal, which is exactly how the sheet ended up missing
// columns the CSV had.
export async function buildProductCsvRows(opts?: { status?: ShpProductStatus; categorySlug?: string }): Promise<ProductCsvRow[]> {
  // Page through the whole catalogue: listProducts clamps perPage to 100 to
  // guard the public list, so asking for 10_000 only ever returned the first
  // page - silently exporting a fraction of a large shop.
  //
  // Variant children aren't standalone catalogue rows; they export via Product
  // options' own CSV, not the core product export.
  const products = await collectPaged<ShpProduct>(async (page) => {
    const { products: items, total } = await listProducts({ ...opts, page, perPage: 100, excludeHidden: true })
    return { items, total }
  })

  const [categories, tags, collections] = await Promise.all([listCategories(), listTags(), listCollections()])
  const categoryById = new Map(categories.map((c) => [c.id, c.slug]))
  const tagById = new Map(tags.map((t) => [t.id, t.slug]))
  const collectionById = new Map(collections.map((c) => [c.id, c.slug]))
  const taxCodeById = await getTaxClassCodesByIds(products.map((p) => p.taxClassId).filter((id): id is string => !!id))

  const rows: ProductCsvRow[] = []
  for (const p of products) {
    const [media, categoryIds, tagIds, collectionIds] = await Promise.all([
      getProductMedia(p.id), getProductCategoryIds(p.id), getProductTagIds(p.id), getProductCollectionIds(p.id),
    ])
    const { imageUrls, imageAlt } = serializeMedia(media)
    rows.push({
      sku: p.sku ?? '', slug: p.slug, name: p.name, type: p.type, status: p.status, description: p.description ?? '',
      short_description: p.shortDescription ?? '', price: p.price, compare_at_price: p.compareAtPrice ?? '',
      cost_price: p.costPrice ?? '', tax_class: (p.taxClassId && taxCodeById.get(p.taxClassId)) || '',
      track_inventory: String(p.trackInventory), stock_count: num(p.stockCount),
      low_stock_threshold: num(p.lowStockThreshold), out_of_stock_behaviour: p.outOfStockBehaviour,
      weight: p.weight ?? '', weight_unit: p.weightUnit ?? '',
      dimension_l: num(p.dimensionL), dimension_w: num(p.dimensionW), dimension_h: num(p.dimensionH),
      dimension_unit: p.dimensionUnit ?? '',
      download_limit: num(p.downloadLimit), download_expiry: num(p.downloadExpiry),
      is_pre_order: String(p.isPreOrder), pre_order_dispatch_date: isoDate(p.preOrderDispatchDate),
      pre_order_note: p.preOrderNote ?? '', pre_order_max_quantity: num(p.preOrderMaxQuantity),
      related_mode: p.relatedMode, related_limit: num(p.relatedLimit),
      upsell_mode: p.upsellMode, upsell_limit: num(p.upsellLimit),
      categories: categoryIds.map((id) => categoryById.get(id)).filter(Boolean).join('|'),
      tags: tagIds.map((id) => tagById.get(id)).filter(Boolean).join('|'),
      collections: collectionIds.map((id) => collectionById.get(id)).filter(Boolean).join('|'),
      meta_title: p.metaTitle ?? '', meta_description: p.metaDescription ?? '',
      image_urls: imageUrls, image_alt: imageAlt, barcode: p.barcode ?? '',
    })
  }
  return rows
}
