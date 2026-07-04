// Hand-rolled CSV parser/writer (Directory precedent - no papaparse dependency).
export const CSV_COLUMNS = [
  'sku', 'name', 'type', 'status', 'description', 'short_description', 'price', 'compare_at_price', 'cost_price',
  'tax_class', 'track_inventory', 'stock_count', 'low_stock_threshold', 'out_of_stock_behaviour', 'weight', 'weight_unit',
  'categories', 'tags', 'collections', 'meta_title', 'meta_description', 'image_urls', 'barcode',
] as const

export type CsvColumn = (typeof CSV_COLUMNS)[number]

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

export function buildExportCsv(rows: Record<CsvColumn, string>[]): string {
  const lines = [toCsvRow([...CSV_COLUMNS]), ...rows.map((r) => toCsvRow(CSV_COLUMNS.map((c) => r[c] ?? '')))]
  return lines.join('\r\n')
}

export function buildImportTemplateCsv(): string {
  return toCsvRow([...CSV_COLUMNS]) + '\r\n'
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

export function headerMatchesFormat(header: string[]): boolean {
  const normalised = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  return CSV_COLUMNS.every((c) => normalised.includes(c))
}
