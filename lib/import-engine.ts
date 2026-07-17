import { parseCsv, resolveColumnMap, parseMediaCells, type CsvColumn } from '@/modules/shop/lib/csv'
import { getProductBySlug, createProduct, updateProduct, setProductMedia, setProductCategories, setProductTags, setProductCollections } from '@/modules/shop/lib/db/products'
import { findOrCreateTagBySlug, getCategoryBySlug, createCategory, getCollectionBySlug, createCollection } from '@/modules/shop/lib/db/catalogue'
import { getTaxClassByCode } from '@/modules/shop/lib/db/tax-shipping'
import { prisma } from '@/lib/db/prisma'
import { slugify, ensureUniqueProductSlug } from '@/modules/shop/lib/slug'
import { updateImportJobProgress, markImportJobCompleted } from '@/modules/shop/lib/db/import-jobs'
import { sendShopEmail } from '@/modules/shop/lib/email'

type RowError = { row: number; reason: string }

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
export async function processImportJob(jobId: string, csvText: string, adminEmail: string, columnMap: Record<string, string> | null): Promise<void> {
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
      const taxClass = taxClassCode ? await getTaxClassByCode(taxClassCode) : null

      const existing = sku
        ? await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "shp_products" WHERE "sku" = ${sku} LIMIT 1`
        : []
      const productId = existing[0]?.id

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
      if (productId) {
        await updateProduct(productId, fields)
        resolvedId = productId
        updated++
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

      if (categoryNames.length) await setProductCategories(resolvedId, await resolveTermIds(categoryNames, getCategoryBySlug, (n, s) => createCategory({ name: n, slug: s })))
      if (tagNames.length) await setProductTags(resolvedId, await resolveTagIds(tagNames))
      if (collectionNames.length) await setProductCollections(resolvedId, await resolveTermIds(collectionNames, getCollectionBySlug, (n, s) => createCollection({ name: n, slug: s })))
      if (mediaCells.length) await setProductMedia(resolvedId, mediaCells.map((m, idx) => ({ type: m.type, url: m.url, altText: m.altText, isPrimary: idx === 0 })))
    } catch (err) {
      errors.push({ row: rowNumber, reason: err instanceof Error ? err.message : 'Unknown error' })
      skipped++
    }

    if ((i + 1) % 25 === 0 || i === dataRows.length - 1) {
      await updateImportJobProgress(jobId, { processedRows: i + 1, createdCount: created, updatedCount: updated, skippedCount: skipped, errors })
    }
  }

  await markImportJobCompleted(jobId, 'COMPLETED')
  await sendShopEmail('IMPORT_COMPLETE', adminEmail, {
    createdCount: String(created), updatedCount: String(updated), skippedCount: String(skipped),
  })
}
