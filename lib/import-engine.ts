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
import type { ShpProduct } from '@/modules/shop/lib/types'

type RowError = { row: number; reason: string }

type ImportFields = {
  name: string; description: string | null; shortDescription: string | null; price: number
  compareAtPrice: number | null; costPrice: number | null; taxClassId: string | null
  trackInventory: boolean; stockCount: number | null; lowStockThreshold: number | null
  outOfStockBehaviour: 'BLOCK' | 'BACKORDER'; weight: number | null; weightUnit: string | null
  metaTitle: string | null; metaDescription: string | null; barcode: string | null
}

// A CSV row carries every column on every export, whether or not the owner
// actually touched it - so re-importing (and every Google-Sheet Pull) used to
// write every matched product back unconditionally, bumping updated_at and
// costing a write no different row actually needed. Comparing first turns most
// of a re-sync into pure reads, and makes "N updated" mean what it says.
function productFieldsUnchanged(existing: ShpProduct, fields: ImportFields): boolean {
  const num = (s: string | null) => (s == null ? null : Number(s))
  return existing.name === fields.name
    && existing.description === fields.description
    && existing.shortDescription === fields.shortDescription
    && Number(existing.price) === fields.price
    && num(existing.compareAtPrice) === fields.compareAtPrice
    && num(existing.costPrice) === fields.costPrice
    && existing.taxClassId === fields.taxClassId
    && existing.trackInventory === fields.trackInventory
    && existing.stockCount === fields.stockCount
    && existing.lowStockThreshold === fields.lowStockThreshold
    && existing.outOfStockBehaviour === fields.outOfStockBehaviour
    && num(existing.weight) === fields.weight
    && existing.weightUnit === fields.weightUnit
    && existing.metaTitle === fields.metaTitle
    && existing.metaDescription === fields.metaDescription
    && existing.barcode === fields.barcode
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

// C.5: reads the CSV row by row, matches by SKU for updates, creates DRAFT
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

  // One-pass pre-scan so the whole import matches with two queries instead of a
  // lookup (and a full re-read for the compare) per row. A row carrying a SKU is
  // matched by it; the rest fall back to the slug derived from the name - the same
  // identity the per-row path used. The mapped ShpProduct doubles as the compare
  // baseline, so productFieldsUnchanged needs no extra read either. This is the
  // bulk of what made a large Google-Sheet Pull crawl.
  const skuSet = new Set<string>()
  const slugSet = new Set<string>()
  for (const row of dataRows) {
    const sku = cell(row, 'sku') || null
    if (sku) { skuSet.add(sku); continue }
    const name = cell(row, 'name')
    if (name) slugSet.add(slugify(name))
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
      const existingProduct = sku ? productsBySku.get(sku) : productsBySlug.get(slugify(name))
      const productId = existingProduct?.id

      const fields = {
        name,
        description: cell(row, 'description') || null,
        shortDescription: cell(row, 'short_description') || null,
        price,
        compareAtPrice: numOrNull(cell(row, 'compare_at_price')),
        costPrice: numOrNull(cell(row, 'cost_price')),
        taxClassId: taxClass?.id ?? null,
        trackInventory: cell(row, 'track_inventory').toLowerCase() === 'true',
        stockCount: numOrNull(cell(row, 'stock_count')),
        lowStockThreshold: numOrNull(cell(row, 'low_stock_threshold')),
        outOfStockBehaviour: (cell(row, 'out_of_stock_behaviour').toUpperCase() || 'BLOCK') as 'BLOCK' | 'BACKORDER',
        weight: numOrNull(cell(row, 'weight')),
        weightUnit: cell(row, 'weight_unit') || null,
        metaTitle: cell(row, 'meta_title') || null,
        metaDescription: cell(row, 'meta_description') || null,
        barcode: cell(row, 'barcode') || null,
      }

      let resolvedId: string
      let rowChanged = false
      if (existingProduct) {
        if (!productFieldsUnchanged(existingProduct, fields)) {
          await updateProduct(existingProduct.id, fields)
          rowChanged = true
        }
        resolvedId = existingProduct.id
      } else {
        const slug = await ensureUniqueProductSlug(slugify(name))
        const { id } = await createProduct({ ...fields, slug, type: type as 'PHYSICAL' | 'DIGITAL' | 'SERVICE', status: 'DRAFT', sku })
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
