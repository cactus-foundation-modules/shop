import { parseCsv, resolveColumnMap, parseMediaCells, type CsvColumn } from '@/modules/shop/lib/csv'
import {
  createProduct, updateProduct,
  getProductsBySkus, getProductsBySlugs,
  getProductCategoryIds, getProductTagIds, getProductCollectionIds, getProductMedia,
  setProductMedia, setProductCategories, setProductTags, setProductCollections,
} from '@/modules/shop/lib/db/products'
import { findOrCreateTagBySlug, getCategoryBySlug, createCategory, getCollectionBySlug, createCollection } from '@/modules/shop/lib/db/catalogue'
import { getTaxClassByCode } from '@/modules/shop/lib/db/tax-shipping'
import { slugify, ensureUniqueProductSlug } from '@/modules/shop/lib/slug'
import { updateImportJobProgress, markImportJobCompleted } from '@/modules/shop/lib/db/import-jobs'
import { sendShopEmail } from '@/modules/shop/lib/email'
import type { ShpProduct, ShpProductStatus, ShpRecommendationMode } from '@/modules/shop/lib/types'

type RowError = { row: number; reason: string }

// Only the fields a row actually carries are present: a column the CSV omits is
// left alone rather than blanked, which is what keeps a pre-slug export (or the
// Google-Sheet mirror with cost_price hidden) from wiping the fields it cannot
// see. A present-but-blank cell still means "clear this".
type ImportFields = Partial<{
  name: string; slug: string; status: ShpProductStatus
  description: string | null; shortDescription: string | null; price: number
  salePrice: number | null; retailPrice: number | null; tradePrice: number | null
  costPrice: number | null; taxClassId: string | null
  trackInventory: boolean; stockCount: number | null; lowStockThreshold: number | null
  outOfStockBehaviour: 'BLOCK' | 'BACKORDER'; weight: number | null; weightUnit: string | null
  dimensionL: number | null; dimensionW: number | null; dimensionH: number | null; dimensionUnit: string | null
  downloadLimit: number | null; downloadExpiry: number | null
  isPreOrder: boolean; preOrderDispatchDate: Date | null; preOrderNote: string | null; preOrderMaxQuantity: number | null
  relatedMode: ShpRecommendationMode; upsellMode: ShpRecommendationMode; relatedLimit: number; upsellLimit: number
  metaTitle: string | null; metaDescription: string | null; barcode: string | null
}>

// Fields stored as SQL numeric, so Prisma hands them back as decimal strings
// ("10.00") that must be compared as numbers, not text.
const DECIMAL_FIELDS = new Set(['price', 'salePrice', 'retailPrice', 'tradePrice', 'costPrice', 'weight', 'dimensionL', 'dimensionW', 'dimensionH'])

// A CSV row carries every column on every export, whether or not the owner
// actually touched it - so re-importing (and every Google-Sheet Pull) used to
// write every matched product back unconditionally, bumping updated_at and
// costing a write no different row actually needed. Comparing first turns most
// of a re-sync into pure reads, and makes "N updated" mean what it says.
function productFieldsUnchanged(existing: ShpProduct, fields: ImportFields): boolean {
  return (Object.keys(fields) as (keyof ImportFields)[]).every((key) => {
    const incoming = fields[key]
    const current = (existing as Record<string, unknown>)[key]
    if (incoming instanceof Date || current instanceof Date) {
      const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : null)
      return iso(incoming) === iso(current)
    }
    if (DECIMAL_FIELDS.has(key)) {
      const num = (v: unknown) => (v == null || v === '' ? null : Number(v))
      return num(incoming) === num(current)
    }
    return incoming === current
  })
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((id) => setB.has(id))
}

function sameIdOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

type DesiredMedia = { type: string; url: string; altText: string | null; isPrimary: boolean }

function sameMedia(desired: DesiredMedia[], current: DesiredMedia[]): boolean {
  return desired.length === current.length && desired.every((m, i) =>
    m.type === current[i]!.type && m.url === current[i]!.url
    && (m.altText ?? null) === (current[i]!.altText ?? null) && m.isPrimary === current[i]!.isPrimary
  )
}

// Parse an optional numeric CSV cell: empty or non-numeric -> null, so a stray
// "lots" in stock_count doesn't write NaN and abort the row with an opaque DB
// error (only `price` was guarded before).
function numOrNull(raw: string): number | null {
  if (!raw) return null
  const n = Number(raw)
  return Number.isNaN(n) ? null : n
}

// A date cell the owner typed: blank clears the date, YYYY-MM-DD (or anything
// else Date can read) sets it. Undefined means "unreadable - leave it alone",
// which the caller drops from the update rather than writing an Invalid Date.
function dateOrNull(raw: string): Date | null | undefined {
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

async function resolveTermIds(
  values: string[],
  getBySlug: (slug: string) => Promise<{ id: string } | null>,
  create: (name: string, slug: string) => Promise<{ id: string }>
): Promise<string[]> {
  const ids: string[] = []
  for (const raw of values) {
    const name = raw.trim()
    if (!name) continue
    const slug = slugify(name)
    const existing = await getBySlug(slug)
    if (existing) { ids.push(existing.id); continue }
    const created = await create(name, slug)
    ids.push(created.id)
  }
  return ids
}

async function resolveTagIds(names: string[]): Promise<string[]> {
  const ids: string[] = []
  for (const raw of names) {
    const name = raw.trim()
    if (!name) continue
    const { id } = await findOrCreateTagBySlug(name, slugify(name))
    ids.push(id)
  }
  return ids
}

// C.5: reads the CSV row by row, matches by SKU (or slug) for updates, creates
// products otherwise, auto-creates categories/tags/collections by slug, and
// stores image_urls as IMAGE-type media rows pointing at the external URL
// (Q13 - not re-uploaded). Runs inside Next's after() (Q7), progress tracked
// on the shp_import_jobs row so the admin can poll it.
export async function processImportJob(jobId: string, csvText: string, adminEmail: string, columnMap: Record<string, string> | null, opts?: { notify?: boolean }): Promise<void> {
  const rows = parseCsv(csvText)
  const header = rows[0] ?? []
  const dataRows = rows.slice(1)
  const colIndex = resolveColumnMap(header, columnMap)

  let created = 0
  let updated = 0
  let skipped = 0
  const errors: RowError[] = []

  function cell(row: string[], column: CsvColumn): string {
    const index = Object.entries(colIndex).find(([, c]) => c === column)?.[0]
    return index !== undefined ? (row[Number(index)] ?? '').trim() : ''
  }

  // Whether the CSV carries the column at all. An absent column means "this
  // import has nothing to say about that field"; a present-but-empty cell means
  // "clear it". Conflating the two is how a cost_price-free Google-Sheet Pull
  // would have wiped every margin in the shop.
  function hasColumn(column: CsvColumn): boolean {
    return Object.values(colIndex).includes(column)
  }

  // The slug a row identifies itself by: its own slug cell when the CSV carries
  // one, otherwise the slug derived from the name (which is what the format did
  // before slug became a column).
  function rowSlug(row: string[]): string {
    const explicit = hasColumn('slug') ? cell(row, 'slug') : ''
    return slugify(explicit || cell(row, 'name'))
  }

  // One-pass pre-scan so the whole import matches with two queries instead of a
  // lookup (and a full re-read for the compare) per row. A row carrying a SKU is
  // matched by it; the rest fall back to the row's slug - the same identity the
  // per-row path used. The mapped ShpProduct doubles as the compare baseline, so
  // productFieldsUnchanged needs no extra read either. This is the bulk of what
  // made a large Google-Sheet Pull crawl.
  const skuSet = new Set<string>()
  const slugSet = new Set<string>()
  for (const row of dataRows) {
    const sku = cell(row, 'sku') || null
    if (sku) { skuSet.add(sku); continue }
    const slug = rowSlug(row)
    if (slug) slugSet.add(slug)
  }
  const productsBySku = await getProductsBySkus([...skuSet])
  const productsBySlug = await getProductsBySlugs([...slugSet])
  // Tax classes are looked up by a short code many rows share; resolve each once.
  const taxClassByCode = new Map<string, Awaited<ReturnType<typeof getTaxClassByCode>>>()

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]!
    const rowNumber = i + 2 // 1-indexed + header row
    try {
      const sku = cell(row, 'sku') || null
      const name = cell(row, 'name')
      const type = cell(row, 'type').toUpperCase()
      if (!name) { errors.push({ row: rowNumber, reason: 'Missing name' }); skipped++; continue }
      if (!['PHYSICAL', 'DIGITAL', 'SERVICE'].includes(type)) { errors.push({ row: rowNumber, reason: `Invalid type "${type}"` }); skipped++; continue }
      const priceRaw = cell(row, 'price')
      const price = Number(priceRaw)
      if (!priceRaw || Number.isNaN(price)) { errors.push({ row: rowNumber, reason: 'Missing or invalid price' }); skipped++; continue }

      const taxClassCode = cell(row, 'tax_class')
      let taxClass = taxClassCode ? taxClassByCode.get(taxClassCode) ?? null : null
      if (taxClassCode && !taxClassByCode.has(taxClassCode)) {
        taxClass = await getTaxClassByCode(taxClassCode)
        taxClassByCode.set(taxClassCode, taxClass)
      }

      // Match an existing product by SKU when the row carries one; otherwise fall
      // back to the slug derived from the name. Without this a SKU-less product
      // (most small shops have none) can never be matched on re-import, so every
      // import - and every Google-Sheet Pull - duplicated the whole catalogue
      // with a fresh `-2` slug. Slug is the only other stable, unique identity we
      // carry; catalogue-hidden variant children are excluded so a name clash
      // with a variant can't hijack the row. The pre-loaded maps mean no per-row
      // query, and the matched row is itself the compare baseline below.
      const existingProduct = sku ? productsBySku.get(sku) : productsBySlug.get(rowSlug(row))
      const productId = existingProduct?.id

      const fields: ImportFields = { name, price }
      // Set a field only when the CSV carries its column, so an import that
      // simply doesn't mention a field never blanks it.
      function put<K extends keyof ImportFields>(column: CsvColumn, key: K, value: ImportFields[K] | undefined): void {
        if (!hasColumn(column) || value === undefined) return
        fields[key] = value
      }
      const enumCell = <T extends string>(column: CsvColumn, allowed: readonly T[]): T | undefined => {
        const value = cell(row, column).toUpperCase() as T
        return allowed.includes(value) ? value : undefined
      }

      put('description', 'description', cell(row, 'description') || null)
      put('short_description', 'shortDescription', cell(row, 'short_description') || null)
      put('sale_price', 'salePrice', numOrNull(cell(row, 'sale_price')))
      put('retail_price', 'retailPrice', numOrNull(cell(row, 'retail_price')))
      put('trade_price', 'tradePrice', numOrNull(cell(row, 'trade_price')))
      put('cost_price', 'costPrice', numOrNull(cell(row, 'cost_price')))
      put('tax_class', 'taxClassId', taxClass?.id ?? null)
      put('track_inventory', 'trackInventory', cell(row, 'track_inventory').toLowerCase() === 'true')
      put('stock_count', 'stockCount', numOrNull(cell(row, 'stock_count')))
      put('low_stock_threshold', 'lowStockThreshold', numOrNull(cell(row, 'low_stock_threshold')))
      put('out_of_stock_behaviour', 'outOfStockBehaviour', enumCell('out_of_stock_behaviour', ['BLOCK', 'BACKORDER'] as const))
      put('weight', 'weight', numOrNull(cell(row, 'weight')))
      put('weight_unit', 'weightUnit', cell(row, 'weight_unit') || null)
      put('dimension_l', 'dimensionL', numOrNull(cell(row, 'dimension_l')))
      put('dimension_w', 'dimensionW', numOrNull(cell(row, 'dimension_w')))
      put('dimension_h', 'dimensionH', numOrNull(cell(row, 'dimension_h')))
      put('dimension_unit', 'dimensionUnit', cell(row, 'dimension_unit') || null)
      put('download_limit', 'downloadLimit', numOrNull(cell(row, 'download_limit')))
      put('download_expiry', 'downloadExpiry', numOrNull(cell(row, 'download_expiry')))
      put('is_pre_order', 'isPreOrder', cell(row, 'is_pre_order').toLowerCase() === 'true')
      put('pre_order_dispatch_date', 'preOrderDispatchDate', dateOrNull(cell(row, 'pre_order_dispatch_date')))
      put('pre_order_note', 'preOrderNote', cell(row, 'pre_order_note') || null)
      put('pre_order_max_quantity', 'preOrderMaxQuantity', numOrNull(cell(row, 'pre_order_max_quantity')))
      put('related_mode', 'relatedMode', enumCell('related_mode', ['MANUAL', 'AUTOMATIC'] as const))
      put('upsell_mode', 'upsellMode', enumCell('upsell_mode', ['MANUAL', 'AUTOMATIC'] as const))
      put('related_limit', 'relatedLimit', numOrNull(cell(row, 'related_limit')) ?? undefined)
      put('upsell_limit', 'upsellLimit', numOrNull(cell(row, 'upsell_limit')) ?? undefined)
      put('meta_title', 'metaTitle', cell(row, 'meta_title') || null)
      put('meta_description', 'metaDescription', cell(row, 'meta_description') || null)
      put('barcode', 'barcode', cell(row, 'barcode') || null)
      // Status is honoured on both create and update: the sheet gives the owner a
      // DRAFT/ACTIVE/ARCHIVED dropdown, so a Pull that ignored it would silently
      // discard the one edit they most expect to stick. An unreadable or blank
      // cell leaves the current status alone rather than demoting a live product.
      put('status', 'status', enumCell('status', ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const))

      let resolvedId: string
      let rowChanged = false
      if (existingProduct) {
        // A slug edit renames the product's URL. Uniqueness excludes the product
        // itself, so re-importing an unchanged row is a no-op rather than a
        // creeping `-2` suffix.
        const desiredSlug = rowSlug(row)
        if (hasColumn('slug') && desiredSlug && desiredSlug !== existingProduct.slug) {
          fields.slug = await ensureUniqueProductSlug(desiredSlug, existingProduct.id)
        }
        if (!productFieldsUnchanged(existingProduct, fields)) {
          await updateProduct(existingProduct.id, fields)
          rowChanged = true
        }
        resolvedId = existingProduct.id
      } else {
        const slug = await ensureUniqueProductSlug(rowSlug(row))
        const { id } = await createProduct({
          ...fields, name, price, slug,
          type: type as 'PHYSICAL' | 'DIGITAL' | 'SERVICE',
          status: fields.status ?? 'DRAFT',
          sku,
        })
        resolvedId = id
        created++
      }

      const categoryNames = cell(row, 'categories').split('|').map((s) => s.trim()).filter(Boolean)
      const tagNames = cell(row, 'tags').split('|').map((s) => s.trim()).filter(Boolean)
      const collectionNames = cell(row, 'collections').split('|').map((s) => s.trim()).filter(Boolean)
      // Type-prefixed media: `IMAGE:url|VIDEO_URL:url`, alt aligned in image_alt.
      // Legacy un-prefixed urls fall through to IMAGE, so old CSVs are unchanged.
      const mediaCells = parseMediaCells(cell(row, 'image_urls'), cell(row, 'image_alt'))

      if (categoryNames.length) {
        const ids = await resolveTermIds(categoryNames, getCategoryBySlug, (n, s) => createCategory({ name: n, slug: s }))
        if (!productId || !sameIdSet(ids, await getProductCategoryIds(resolvedId))) { await setProductCategories(resolvedId, ids); rowChanged = true }
      }
      if (tagNames.length) {
        const ids = await resolveTagIds(tagNames)
        if (!productId || !sameIdSet(ids, await getProductTagIds(resolvedId))) { await setProductTags(resolvedId, ids); rowChanged = true }
      }
      if (collectionNames.length) {
        const ids = await resolveTermIds(collectionNames, getCollectionBySlug, (n, s) => createCollection({ name: n, slug: s }))
        if (!productId || !sameIdOrder(ids, await getProductCollectionIds(resolvedId))) { await setProductCollections(resolvedId, ids); rowChanged = true }
      }
      if (mediaCells.length) {
        const desired = mediaCells.map((m, idx) => ({ type: m.type, url: m.url, altText: m.altText, isPrimary: idx === 0 }))
        if (!productId || !sameMedia(desired, await getProductMedia(resolvedId))) { await setProductMedia(resolvedId, desired); rowChanged = true }
      }

      if (productId && rowChanged) updated++
    } catch (err) {
      errors.push({ row: rowNumber, reason: err instanceof Error ? err.message : 'Unknown error' })
      skipped++
    }

    if ((i + 1) % 25 === 0 || i === dataRows.length - 1) {
      await updateImportJobProgress(jobId, { processedRows: i + 1, createdCount: created, updatedCount: updated, skippedCount: skipped, errors })
    }
  }

  await markImportJobCompleted(jobId, 'COMPLETED')
  // A direct CSV upload emails the admin a completion report; a background sync
  // (e.g. a Google-Sheet Pull) that already surfaces its own result passes
  // notify:false so it doesn't spam a report on every run.
  if (opts?.notify !== false) {
    await sendShopEmail('IMPORT_COMPLETE', adminEmail, {
      createdCount: String(created), updatedCount: String(updated), skippedCount: String(skipped),
    })
  }
}
