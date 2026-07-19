import { describe, it, expect } from 'vitest'
import {
  CSV_COLUMNS,
  NUMERIC_CSV_COLUMNS,
  BOOLEAN_CSV_COLUMNS,
  serializeMedia,
  parseMediaCells,
  collectPaged,
  headerMatchesFormat,
  buildExportCsv,
  parseCsv,
  type CsvColumn,
} from '@/modules/shop/lib/csv'

// These guard the three silent-data-loss bugs a plain export -> import round trip
// used to have. Each one bit somebody before the Google-Sheet mirror turned the
// round trip from a rare manual chore into a routine one-click sync. The DB-side
// (tax_class code lookup, setProductMedia) is exercised on a live install; the
// pure grid<->cell logic that decided *what* to write is pinned here.

describe('media round-trip (Bug 2: videos flattened to images, alt text dropped)', () => {
  it('carries the media kind and alt text through serialize -> parse unchanged', () => {
    const media = [
      { type: 'IMAGE', url: 'https://cdn/x/hero.jpg', altText: 'Hero shot' },
      { type: 'VIDEO_FILE', url: 'https://cdn/x/demo.mp4', altText: null },
      { type: 'VIDEO_URL', url: 'https://youtu.be/abc', altText: 'Promo' },
    ]
    const { imageUrls, imageAlt } = serializeMedia(media)
    const parsed = parseMediaCells(imageUrls, imageAlt)
    expect(parsed).toEqual([
      { type: 'IMAGE', url: 'https://cdn/x/hero.jpg', altText: 'Hero shot' },
      { type: 'VIDEO_FILE', url: 'https://cdn/x/demo.mp4', altText: null },
      { type: 'VIDEO_URL', url: 'https://youtu.be/abc', altText: 'Promo' },
    ])
  })

  it('keeps a https: url intact rather than reading https as a type prefix', () => {
    const parsed = parseMediaCells('https://x.com/a.jpg', '')
    expect(parsed).toEqual([{ type: 'IMAGE', url: 'https://x.com/a.jpg', altText: null }])
  })

  it('reads a legacy un-prefixed cell as an IMAGE (backwards compatible)', () => {
    const parsed = parseMediaCells('https://a.jpg|https://b.jpg', '')
    expect(parsed.map((m) => m.type)).toEqual(['IMAGE', 'IMAGE'])
    expect(parsed.map((m) => m.url)).toEqual(['https://a.jpg', 'https://b.jpg'])
  })

  it('matches the prefix case-insensitively', () => {
    expect(parseMediaCells('video_url:https://youtu.be/x', '')[0]!.type).toBe('VIDEO_URL')
  })

  it('aligns alt text positionally and treats a missing image_alt column as no alt', () => {
    const { imageUrls } = serializeMedia([
      { type: 'IMAGE', url: 'a', altText: 'first' },
      { type: 'IMAGE', url: 'b', altText: null },
    ])
    expect(parseMediaCells(imageUrls, '').every((m) => m.altText === null)).toBe(true)
  })

  it('produces no media rows for an empty cell', () => {
    expect(parseMediaCells('', '')).toEqual([])
  })
})

describe('paginated export (Bug 3: export truncated at 100 products)', () => {
  it('collects every page, not just the first 100', async () => {
    const catalogue = Array.from({ length: 101 }, (_, i) => `sku-${i}`)
    const collected = await collectPaged<string>(async (page) => {
      const start = (page - 1) * 100
      return { items: catalogue.slice(start, start + 100), total: catalogue.length }
    })
    expect(collected).toHaveLength(101)
    expect(collected[100]).toBe('sku-100')
  })

  it('stops on an empty page even if total is momentarily larger (no infinite loop)', async () => {
    let calls = 0
    const collected = await collectPaged<string>(async (page) => {
      calls++
      if (page === 1) return { items: ['a', 'b'], total: 9999 }
      return { items: [], total: 9999 }
    })
    expect(collected).toEqual(['a', 'b'])
    expect(calls).toBe(2)
  })
})

describe('header format gate (image_alt / cost_price optional)', () => {
  it('accepts a pre-image_alt export header', () => {
    const legacy = CSV_COLUMNS.filter((c) => c !== 'image_alt')
    expect(headerMatchesFormat([...legacy])).toBe(true)
  })

  it('accepts a header with cost_price dropped (margins hidden on the sheet)', () => {
    const noCost = CSV_COLUMNS.filter((c): c is CsvColumn => c !== 'image_alt' && c !== 'cost_price')
    expect(headerMatchesFormat([...noCost])).toBe(true)
  })

  it('still rejects a header missing a required column', () => {
    const broken = CSV_COLUMNS.filter((c) => c !== 'price')
    expect(headerMatchesFormat([...broken])).toBe(false)
  })

  it('accepts the full current header', () => {
    expect(headerMatchesFormat([...CSV_COLUMNS])).toBe(true)
  })
})

describe('grid round-trip through the CSV text', () => {
  it('survives a full buildExportCsv -> parseCsv cycle with tax_class populated', () => {
    const row = Object.fromEntries(CSV_COLUMNS.map((c) => [c, ''])) as Record<CsvColumn, string>
    row.sku = 'ABC-1'
    row.name = 'Widget'
    row.type = 'PHYSICAL'
    row.price = '9.99'
    row.tax_class = 'standard'
    row.image_urls = 'VIDEO_URL:https://youtu.be/x|IMAGE:https://a.jpg'
    row.image_alt = 'clip|photo'
    const csv = buildExportCsv([row])
    const grid = parseCsv(csv)
    const header = grid[0]!
    const data = grid[1]!
    const at = (col: CsvColumn) => data[header.indexOf(col)]
    expect(at('tax_class')).toBe('standard')
    expect(at('image_urls')).toBe('VIDEO_URL:https://youtu.be/x|IMAGE:https://a.jpg')
    expect(parseMediaCells(at('image_urls')!, at('image_alt')!)).toEqual([
      { type: 'VIDEO_URL', url: 'https://youtu.be/x', altText: 'clip' },
      { type: 'IMAGE', url: 'https://a.jpg', altText: 'photo' },
    ])
  })
})

// The format is the contract between the CSV export, the CSV importer and the
// Google-Sheet mirror. The sheet lost slug (and a dozen other fields) for exactly
// as long as those three were maintained by hand, so what the format must and
// must not carry is pinned here rather than left to review.
describe('product CSV format coverage', () => {
  it('carries every owner-editable product field', () => {
    for (const column of [
      'slug', 'dimension_l', 'dimension_w', 'dimension_h', 'dimension_unit',
      'download_limit', 'download_expiry', 'is_pre_order', 'pre_order_dispatch_date',
      'pre_order_note', 'pre_order_max_quantity', 'related_mode', 'related_limit',
      'upsell_mode', 'upsell_limit',
    ]) {
      expect(CSV_COLUMNS).toContain(column)
    }
  })

  it('carries no id-shaped, derived or system-owned column', () => {
    for (const column of [
      'id', 'digital_file_id', 'og_image_id', 'master_category_id',
      'pre_order_count', 'catalogue_hidden', 'created_at', 'updated_at',
    ]) {
      expect(CSV_COLUMNS).not.toContain(column)
    }
  })

  it('accepts a header from before the fields beyond the original 24 existed', () => {
    const original = [
      'sku', 'name', 'type', 'status', 'description', 'short_description', 'price', 'compare_at_price',
      'tax_class', 'track_inventory', 'stock_count', 'low_stock_threshold', 'out_of_stock_behaviour',
      'weight', 'weight_unit', 'categories', 'tags', 'collections', 'meta_title', 'meta_description',
      'image_urls', 'barcode',
    ]
    expect(headerMatchesFormat(original)).toBe(true)
  })

  it('types numeric and boolean columns for the sheet, and leaves identifiers as text', () => {
    for (const column of ['price', 'sale_price', 'retail_price', 'trade_price', 'stock_count', 'weight', 'dimension_l', 'related_limit']) {
      expect(NUMERIC_CSV_COLUMNS).toContain(column)
    }
    // Leading zeros are meaningful on both, so neither may become a number.
    expect(NUMERIC_CSV_COLUMNS).not.toContain('sku')
    expect(NUMERIC_CSV_COLUMNS).not.toContain('barcode')
    expect(BOOLEAN_CSV_COLUMNS).toEqual(['track_inventory', 'is_pre_order'])
  })
})
