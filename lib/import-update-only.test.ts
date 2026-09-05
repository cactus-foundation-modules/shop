import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ShpProduct } from '@/modules/shop/lib/types'

// A supplier's sale-price sheet is three columns wide and carries no name, type
// or price. The full importer requires all three, because a full row might
// CREATE a product - which is exactly why a sale sheet used to fail every row.
// UPDATE_ONLY drops those requirements, and these pin the consequence an owner
// actually cares about: that the OTHER forty-odd fields are not touched, and
// that nothing new is created. Everything below the import engine is mocked, so
// what is asserted is precisely the writes the engine chose to make.

const updateProduct = vi.fn(async () => {})
const createProduct = vi.fn(async () => ({ id: 'new-id' }))
const setProductMedia = vi.fn(async () => {})
const setProductCategories = vi.fn(async () => {})
const setProductTags = vi.fn(async () => {})
const setProductCollections = vi.fn(async () => {})

// A live product with every field populated, so a wipe of any of them would
// show up as a key in the captured update rather than having to be inferred.
const EXISTING = {
  id: 'p1', name: 'Orion Task Chair', slug: 'orion-task-chair', type: 'PHYSICAL', status: 'ACTIVE',
  description: 'A chair.', descriptionPuck: null, shortDescription: 'Chair', sku: 'ORION-1',
  saleSku: 'ORION-OLD-SALE', supplierSku: 'SUP-99', barcode: '5012345678900', supplier: 'Acme',
  price: '199.00', salePrice: '99.00', retailPrice: '249.00', tradePrice: '150.00', costPrice: '95.00',
  taxClassId: 'tax-1', trackInventory: true, stockCount: 12, lowStockThreshold: 3,
  outOfStockBehaviour: 'BLOCK', weight: '14.5', weightUnit: 'kg',
  dimensionL: '60', dimensionW: '60', dimensionH: '110', dimensionUnit: 'cm',
  digitalFileId: null, downloadLimit: null, downloadExpiry: null,
  metaTitle: 'Orion', metaDescription: 'Buy Orion', ogImageId: null, masterCategoryId: 'cat-1',
  isPreOrder: false, preOrderDispatchDate: null, preOrderNote: null, preOrderMaxQuantity: null,
  preOrderCount: 0, minOrderQuantity: 2, relatedMode: 'AUTOMATIC', upsellMode: 'MANUAL',
  relatedLimit: 4, upsellLimit: 4, catalogueHidden: false, featuredHidden: false,
  popularitySeed: null, popularity: null, createdAt: new Date(), updatedAt: new Date(),
} as unknown as ShpProduct

vi.mock('@/modules/shop/lib/db/products', () => ({
  createProduct: (...args: unknown[]) => createProduct(...(args as [])),
  updateProduct: (...args: unknown[]) => updateProduct(...(args as [])),
  getProductsBySkus: async (skus: string[]) => new Map(skus.includes('ORION-1') ? [['ORION-1', EXISTING]] : []),
  getProductsBySlugs: async () => new Map(),
  getProductCategoryIds: async () => ['cat-1'],
  getProductTagIds: async () => ['tag-1'],
  getProductCollectionIds: async () => ['col-1'],
  getProductMedia: async () => [{ type: 'IMAGE', url: 'https://cdn/hero.jpg', altText: 'Hero', isPrimary: true }],
  setProductMedia: (...args: unknown[]) => setProductMedia(...(args as [])),
  setProductCategories: (...args: unknown[]) => setProductCategories(...(args as [])),
  setProductTags: (...args: unknown[]) => setProductTags(...(args as [])),
  setProductCollections: (...args: unknown[]) => setProductCollections(...(args as [])),
}))
vi.mock('@/modules/shop/lib/db/catalogue', () => ({
  findOrCreateTagBySlug: async () => ({ id: 'tag-1' }),
  getCategoryBySlug: async () => ({ id: 'cat-1' }),
  createCategory: async () => ({ id: 'cat-1' }),
  getCollectionBySlug: async () => ({ id: 'col-1' }),
  createCollection: async () => ({ id: 'col-1' }),
}))
vi.mock('@/modules/shop/lib/db/tax-shipping', () => ({ buildTaxClassRefIndex: async () => new Map() }))
vi.mock('@/modules/shop/lib/db/import-jobs', () => ({
  updateImportJobProgress: async () => {},
  markImportJobCompleted: async () => {},
}))
vi.mock('@/modules/shop/lib/email', () => ({ sendShopEmail: async () => {} }))
vi.mock('@/modules/shop/lib/slug', () => ({
  slugify: (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  ensureUniqueProductSlug: async (base: string) => base,
}))

const { processImportJob } = await import('@/modules/shop/lib/import-engine')

const SALE_CSV = 'sku,sale_price,sale_sku\r\nORION-1,149.00,ORION-1-SALE\r\n'

async function run(csv: string, mode?: 'FULL' | 'UPDATE_ONLY') {
  await processImportJob('job-1', csv, 'owner@example.com', null, { notify: false, mode })
}

beforeEach(() => {
  updateProduct.mockClear(); createProduct.mockClear(); setProductMedia.mockClear()
  setProductCategories.mockClear(); setProductTags.mockClear(); setProductCollections.mockClear()
})

describe('update-only import of a sale price sheet', () => {
  it('writes the two sale fields and nothing else', async () => {
    await run(SALE_CSV, 'UPDATE_ONLY')
    expect(updateProduct).toHaveBeenCalledTimes(1)
    const [id, fields] = updateProduct.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(id).toBe('p1')
    expect(Object.keys(fields).sort()).toEqual(['salePrice', 'saleSku'])
    expect(fields).toEqual({ salePrice: 149, saleSku: 'ORION-1-SALE' })
  })

  it('never creates a product, and never touches name, price or status', async () => {
    await run(SALE_CSV, 'UPDATE_ONLY')
    expect(createProduct).not.toHaveBeenCalled()
    const [, fields] = updateProduct.mock.calls[0] as unknown as [string, Record<string, unknown>]
    for (const key of ['name', 'slug', 'price', 'status', 'description', 'costPrice', 'stockCount', 'supplierSku', 'taxClassId', 'metaTitle', 'minOrderQuantity', 'trackInventory', 'featuredHidden']) {
      expect(fields).not.toHaveProperty(key)
    }
  })

  it('leaves the product’s categories, tags, collections and images alone', async () => {
    await run(SALE_CSV, 'UPDATE_ONLY')
    expect(setProductCategories).not.toHaveBeenCalled()
    expect(setProductTags).not.toHaveBeenCalled()
    expect(setProductCollections).not.toHaveBeenCalled()
    expect(setProductMedia).not.toHaveBeenCalled()
  })

  it('takes a product off sale when the sale price cell is blank', async () => {
    await run('sku,sale_price,sale_sku\r\nORION-1,,\r\n', 'UPDATE_ONLY')
    const [, fields] = updateProduct.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(fields).toEqual({ salePrice: null, saleSku: null })
  })

  it('skips a row whose sku matches nothing rather than creating one', async () => {
    await run('sku,sale_price,sale_sku\r\nNOT-A-SKU,149.00,X\r\n', 'UPDATE_ONLY')
    expect(createProduct).not.toHaveBeenCalled()
    expect(updateProduct).not.toHaveBeenCalled()
  })

  it('writes nothing at all when the sale price is already what the sheet says', async () => {
    await run('sku,sale_price\r\nORION-1,99.00\r\n', 'UPDATE_ONLY')
    expect(updateProduct).not.toHaveBeenCalled()
  })

  it('reads a blank cell as “no longer on sale”, not as “leave it alone”', async () => {
    await run('sku,sale_price\r\nORION-1,\r\n', 'UPDATE_ONLY')
    const [, fields] = updateProduct.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(fields).toEqual({ salePrice: null })
    expect(fields).not.toHaveProperty('saleSku')
  })

  it('is the mode that makes it work: the same file in the full importer writes nothing', async () => {
    await run(SALE_CSV, 'FULL')
    expect(updateProduct).not.toHaveBeenCalled()
    expect(createProduct).not.toHaveBeenCalled()
  })
})
