// Hand-rolled CSV parser/writer (Directory precedent - no papaparse dependency).
//
// The format carries every owner-editable field on shp_products. Four kinds of
// column are deliberately absent and should stay absent:
//   - id-shaped foreign keys (digital_file_id, og_image_id, master_category_id) -
//     a raw cuid in a spreadsheet is neither readable nor safely typeable;
//   - derived counters (pre_order_count) - the shop owns them, an import must
//     never be able to rewind one;
//   - catalogue_hidden - system state owned by shop-variations, which uses it to
//     park variant child rows out of the catalogue. An owner flipping it in a
//     sheet would strand or expose variant children;
//   - id / created_at / updated_at.
export const CSV_COLUMNS = [
  'sku', 'slug', 'name', 'type', 'status', 'description', 'short_description', 'price', 'sale_price', 'retail_price', 'trade_price', 'cost_price',
  'tax_class', 'track_inventory', 'stock_count', 'low_stock_threshold', 'out_of_stock_behaviour', 'weight', 'weight_unit',
  'dimension_l', 'dimension_w', 'dimension_h', 'dimension_unit',
  'download_limit', 'download_expiry',
  'is_pre_order', 'pre_order_dispatch_date', 'pre_order_note', 'pre_order_max_quantity',
  'related_mode', 'related_limit', 'upsell_mode', 'upsell_limit',
  'categories', 'tags', 'collections', 'meta_title', 'meta_description', 'image_urls', 'image_alt', 'barcode', 'supplier',
  // The code the supplier wants while the line is on offer. Appended rather than
  // sat next to `sku` so every sheet written before it existed keeps its column
  // order (the Google-Sheet mirror aligns by header, but a hand-kept CSV does not).
  'sale_sku',
  // The fewest of a line the shop will sell in one go. Appended for the same
  // column-order reason as `sale_sku` above.
  'min_order_quantity',
  // What the supplier calls this line, for ordering it back off them. Appended
  // for the same column-order reason as `sale_sku` above. Text, never numeric -
  // a supplier code is free to carry leading zeros.
  'supplier_sku',
  // The owner's "keep this one off the featured shelves" tick. Appended for the
  // same column-order reason as `sale_sku` above.
  'featured_hidden',
] as const

export type CsvColumn = (typeof CSV_COLUMNS)[number]

// Columns that a valid shop CSV may omit. `image_alt` was appended after this
// format shipped, so every CSV in the wild predates it; `cost_price` is genuinely
// optional (and the Google-Sheet mirror drops it entirely when the owner hides
// margins). headerMatchesFormat must tolerate both being absent, or an old export
// would be bounced into the manual column-mapping step for no reason.
//
// Everything added after the original 24 columns is optional for the same
// reason: an export taken before they existed is still a perfectly good CSV, and
// bouncing it into the manual mapping step would be a regression. An absent
// column leaves its field alone on import; it is never read as "blank this".
const OPTIONAL_CSV_COLUMNS: readonly CsvColumn[] = [
  'image_alt', 'cost_price', 'sale_price', 'retail_price', 'trade_price', 'slug',
  'dimension_l', 'dimension_w', 'dimension_h', 'dimension_unit',
  'download_limit', 'download_expiry',
  'is_pre_order', 'pre_order_dispatch_date', 'pre_order_note', 'pre_order_max_quantity',
  'related_mode', 'related_limit', 'upsell_mode', 'upsell_limit',
  'supplier', 'sale_sku', 'min_order_quantity', 'supplier_sku', 'featured_hidden',
]

// Columns whose values are numbers, not text. The CSV writer does not care (every
// cell is text there), but the Google-Sheet mirror does: writing "100" as a string
// makes a text cell, which Sheets shows as '100 and will not sum or sort.
export const NUMERIC_CSV_COLUMNS: readonly CsvColumn[] = [
  'price', 'sale_price', 'retail_price', 'trade_price', 'cost_price', 'stock_count', 'low_stock_threshold', 'weight',
  'dimension_l', 'dimension_w', 'dimension_h', 'download_limit', 'download_expiry',
  'pre_order_max_quantity', 'min_order_quantity', 'related_limit', 'upsell_limit',
]

// Columns whose values are booleans. `sku` and `barcode` are excluded from the
// numeric list on purpose - they are identifiers that may carry leading zeros.
export const BOOLEAN_CSV_COLUMNS: readonly CsvColumn[] = ['track_inventory', 'is_pre_order', 'featured_hidden']

// The three media kinds shp_product_media.type may hold. Kept here (not just in
// the DB CHECK) because the CSV format encodes the kind as a `TYPE:url` prefix.
export const MEDIA_TYPES = ['IMAGE', 'VIDEO_FILE', 'VIDEO_URL'] as const
export type MediaType = (typeof MEDIA_TYPES)[number]
export type MediaCell = { type: MediaType; url: string; altText: string | null }

// Serialise a product's media rows into the two positionally-aligned pipe-joined
// cells the CSV carries: `image_urls` holds `TYPE:url` per entry, `image_alt`
// holds the matching alt text (empty where there is none). Keeping the kind in
// the cell is what stops a video degrading to an image on the next import.
export function serializeMedia(media: Array<{ type: string; url: string; altText?: string | null }>): { imageUrls: string; imageAlt: string } {
  return {
    imageUrls: media.map((m) => `${m.type}:${m.url}`).join('|'),
    imageAlt: media.map((m) => m.altText ?? '').join('|'),
  }
}

// Inverse of serializeMedia, and deliberately lenient for backwards compatibility.
// An entry whose prefix is not one of the three known media kinds is read as a
// plain IMAGE url - so `https://x/a.jpg` keeps its `https:` and every pre-prefix
// CSV imports exactly as it did before. Alt text is taken from the aligned
// `image_alt` entry, or null when that column is absent/blank.
export function parseMediaCells(imageUrls: string, imageAlt: string): MediaCell[] {
  const urlEntries = imageUrls.split('|').map((s) => s.trim()).filter(Boolean)
  const altEntries = imageAlt.split('|').map((s) => s.trim())
  return urlEntries.map((entry, idx) => {
    const match = /^(IMAGE|VIDEO_FILE|VIDEO_URL):(.*)$/i.exec(entry)
    const type = (match ? match[1]!.toUpperCase() : 'IMAGE') as MediaType
    const url = match ? match[2]! : entry
    const alt = altEntries[idx]
    return { type, url, altText: alt ? alt : null }
  })
}

// Collect every page from a paginated fetcher into one array. Used by the export
// route so it emits the whole catalogue instead of the first page - the
// per-page clamp in listProducts stays put (it guards the public list). The
// empty-page guard stops a total that shifts mid-loop spinning forever.
export async function collectPaged<T>(fetchPage: (page: number) => Promise<{ items: T[]; total: number }>): Promise<T[]> {
  const all: T[] = []
  for (let page = 1; ; page++) {
    const { items, total } = await fetchPage(page)
    all.push(...items)
    if (items.length === 0 || all.length >= total) break
  }
  return all
}

export function toCsvField(value: string): string {
  // CSV formula-injection guard: a cell starting with = + - @ (or tab/CR) is
  // executed as a formula by Excel/Sheets. Prefix with a single quote so it's
  // read as text - but leave plain numbers (incl. negatives) untouched so a
  // round-trip export/import keeps numeric columns intact.
  let field = value
  if (/^[=+\-@\t\r]/.test(field) && !/^-?\d+(\.\d+)?$/.test(field)) field = `'${field}`
  if (/[",\n\r]/.test(field)) return `"${field.replace(/"/g, '""')}"`
  return field
}

export function toCsvRow(values: string[]): string {
  return values.map(toCsvField).join(',')
}

// RFC4180-ish parser: handles quoted fields (with embedded commas/newlines) and
// doubled-quote escaping. Returns one array of string cells per row.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i += 1; continue
      }
      field += char; i += 1; continue
    }
    if (char === '"') { inQuotes = true; i += 1; continue }
    if (char === ',') { row.push(field); field = ''; i += 1; continue }
    if (char === '\r') { i += 1; continue }
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue }
    field += char; i += 1
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.length > 1 || r[0] !== '')
}

// `columns` narrows the export to a chosen subset (the Export CSV modal's column
// picker). Defaults to the whole format, so every existing caller is unchanged.
// A subset is still importable: as long as it carries sku or slug it satisfies
// headerMatchesUpdateFormat and goes back in as an update-only import.
export function buildExportCsv(rows: Record<CsvColumn, string>[], columns: readonly CsvColumn[] = CSV_COLUMNS): string {
  const cols = columns.length > 0 ? columns : CSV_COLUMNS
  const lines = [toCsvRow([...cols]), ...rows.map((r) => toCsvRow(cols.map((c) => r[c] ?? '')))]
  return lines.join('\r\n')
}

// The template an owner downloads before filling a CSV in by hand. Passing a
// subset builds a partial template for an update-only import (see
// headerMatchesUpdateFormat) - a sale-price sheet wants three columns, not fifty.
export function buildImportTemplateCsv(columns: readonly CsvColumn[] = CSV_COLUMNS): string {
  return toCsvRow([...columns]) + '\r\n'
}

// Keep only the names that are real CSV columns, in the format's own order, so
// a caller-supplied subset can never smuggle an unknown header through.
export function pickCsvColumns(names: string[]): CsvColumn[] {
  const wanted = new Set(names.map((n) => n.trim().toLowerCase().replace(/\s+/g, '_')))
  return CSV_COLUMNS.filter((c) => wanted.has(c))
}

// Maps a raw CSV header row to CSV_COLUMNS via an optional column mapping
// (admin-supplied when the uploaded CSV's headers don't match exactly).
export function resolveColumnMap(header: string[], columnMap?: Record<string, string> | null): Record<number, CsvColumn> {
  const map: Record<number, CsvColumn> = {}
  header.forEach((rawHeader, index) => {
    const mapped = columnMap?.[rawHeader] ?? rawHeader.trim().toLowerCase().replace(/\s+/g, '_')
    if ((CSV_COLUMNS as readonly string[]).includes(mapped)) map[index] = mapped as CsvColumn
  })
  return map
}

// The required columns a header is missing (optional columns never count). The
// Google-Sheet mirror uses this to refuse a mangled sheet by name; the shop UI
// uses headerMatchesFormat below to decide auto-submit vs the mapping step.
export function missingFormatColumns(header: string[]): CsvColumn[] {
  const normalised = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  return CSV_COLUMNS.filter((c) => !OPTIONAL_CSV_COLUMNS.includes(c) && !normalised.includes(c))
}

export function headerMatchesFormat(header: string[]): boolean {
  return missingFormatColumns(header).length === 0
}

// The columns an update-only import matches an existing product by. `name` is
// deliberately absent: a partial sheet that carries a name but no sku/slug is
// far more likely to be a mis-picked file than a rename request, and matching it
// on a slugified name would write to whichever product happened to collide.
export const MATCH_CSV_COLUMNS: readonly CsvColumn[] = ['sku', 'slug']

// Whether a header is usable for an update-only import: something to match on,
// and something to write. `name`, `type` and `price` are required by the full
// format only because a row there might CREATE a product - an update-only row
// never does, so a three-column sale-price sheet is a perfectly good import and
// must not be bounced into the manual column-mapping step.
export function headerMatchesUpdateFormat(header: string[]): boolean {
  const columns = Object.values(resolveColumnMap(header))
  return columns.some((c) => MATCH_CSV_COLUMNS.includes(c)) && columns.some((c) => !MATCH_CSV_COLUMNS.includes(c))
}

// Human labels and grouping for the Export CSV column picker. The picker needs a
// name an owner recognises ("Product code", not "sku") and an order that reads
// like the product editor rather than the wire format's own append-only order.
//
// CSV_COLUMN_GROUPS must cover CSV_COLUMNS exactly - once, each - or a column
// added to the format later would be silently unpickable. csv-roundtrip.test.ts
// asserts that, so a new column fails the test rather than quietly vanishing
// from the picker.
export const CSV_COLUMN_LABELS: Record<CsvColumn, string> = {
  sku: 'Product code (sku)',
  slug: 'Web address (slug)',
  name: 'Name',
  type: 'Type',
  status: 'Status',
  description: 'Description',
  short_description: 'Short description',
  price: 'Price',
  sale_price: 'Sale price',
  retail_price: 'RRP',
  trade_price: 'Trade price',
  cost_price: 'Cost price',
  tax_class: 'VAT class',
  track_inventory: 'Track stock',
  stock_count: 'Stock count',
  low_stock_threshold: 'Low stock threshold',
  out_of_stock_behaviour: 'When out of stock',
  weight: 'Weight',
  weight_unit: 'Weight unit',
  dimension_l: 'Length',
  dimension_w: 'Width',
  dimension_h: 'Height',
  dimension_unit: 'Size unit',
  download_limit: 'Download limit',
  download_expiry: 'Download expiry',
  is_pre_order: 'Pre-order',
  pre_order_dispatch_date: 'Pre-order dispatch date',
  pre_order_note: 'Pre-order note',
  pre_order_max_quantity: 'Pre-order maximum',
  related_mode: 'Related products mode',
  related_limit: 'Related products shown',
  upsell_mode: 'Upsell mode',
  upsell_limit: 'Upsells shown',
  categories: 'Categories',
  tags: 'Tags',
  collections: 'Collections',
  meta_title: 'Search title',
  meta_description: 'Search description',
  image_urls: 'Pictures',
  image_alt: 'Picture descriptions',
  barcode: 'Barcode',
  supplier: 'Supplier',
  sale_sku: 'Sale code',
  min_order_quantity: 'Minimum order quantity',
  supplier_sku: 'Supplier code',
  featured_hidden: 'Keep off featured shelves',
}

export type CsvColumnGroup = { label: string; columns: readonly CsvColumn[] }

export const CSV_COLUMN_GROUPS: readonly CsvColumnGroup[] = [
  { label: 'The basics', columns: ['sku', 'name', 'slug', 'type', 'status', 'barcode', 'supplier', 'supplier_sku', 'sale_sku'] },
  { label: 'Prices and VAT', columns: ['price', 'sale_price', 'retail_price', 'trade_price', 'cost_price', 'tax_class'] },
  { label: 'Stock', columns: ['track_inventory', 'stock_count', 'low_stock_threshold', 'out_of_stock_behaviour', 'min_order_quantity'] },
  { label: 'Catalogue', columns: ['categories', 'tags', 'collections', 'featured_hidden'] },
  { label: 'Words and pictures', columns: ['description', 'short_description', 'image_urls', 'image_alt', 'meta_title', 'meta_description'] },
  { label: 'Size and weight', columns: ['weight', 'weight_unit', 'dimension_l', 'dimension_w', 'dimension_h', 'dimension_unit'] },
  { label: 'Pre-orders', columns: ['is_pre_order', 'pre_order_dispatch_date', 'pre_order_note', 'pre_order_max_quantity'] },
  { label: 'Downloads', columns: ['download_limit', 'download_expiry'] },
  { label: 'Related and upsells', columns: ['related_mode', 'related_limit', 'upsell_mode', 'upsell_limit'] },
]
