import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ShpProduct } from '@/modules/shop/lib/types'

// A CSV import runs inside the upload request's sixty seconds. Given a
// deadline, the engine stops between rows once it passes and closes the job as
// FAILED saying where - rather than being killed mid-row and leaving the job
// reading "processing" for ever. These pin that ending, and that a run with
// time to spare is untouched by it. Everything below the engine is mocked.

const updateProduct = vi.fn(async () => {})
const updateImportJobProgress = vi.fn(async (..._args: unknown[]) => {})
const markImportJobCompleted = vi.fn(async (..._args: unknown[]) => {})
const sendShopEmail = vi.fn(async (..._args: unknown[]) => {})

const EXISTING = { id: 'p1', name: 'Orion Task Chair', slug: 'orion-task-chair', sku: 'ORION-1', salePrice: '99.00', saleSku: null } as unknown as ShpProduct

vi.mock('@/modules/shop/lib/db/products', () => ({
  createProduct: async () => ({ id: 'new-id' }),
  updateProduct: (...args: unknown[]) => updateProduct(...(args as [])),
  getProductsBySkus: async (skus: string[]) => new Map(skus.includes('ORION-1') ? [['ORION-1', EXISTING]] : []),
  getProductsBySlugs: async () => new Map(),
  getProductCategoryIds: async () => [],
  getProductTagIds: async () => [],
  getProductCollectionIds: async () => [],
  getProductMedia: async () => [],
  setProductMedia: async () => {},
  setProductCategories: async () => {},
  setProductTags: async () => {},
  setProductCollections: async () => {},
}))
vi.mock('@/modules/shop/lib/db/catalogue', () => ({
  findOrCreateTagBySlug: async () => ({ id: 'tag-1' }),
  getCategoryBySlug: async () => null,
  createCategory: async () => ({ id: 'cat-1' }),
  getCollectionBySlug: async () => null,
  createCollection: async () => ({ id: 'col-1' }),
}))
vi.mock('@/modules/shop/lib/db/tax-shipping', () => ({ buildTaxClassRefIndex: async () => new Map() }))
vi.mock('@/modules/shop/lib/db/import-jobs', () => ({
  updateImportJobProgress: (...args: unknown[]) => updateImportJobProgress(...args),
  markImportJobCompleted: (...args: unknown[]) => markImportJobCompleted(...args),
}))
vi.mock('@/modules/shop/lib/email', () => ({ sendShopEmail: (...args: unknown[]) => sendShopEmail(...args) }))
vi.mock('@/modules/shop/lib/slug', () => ({
  slugify: (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  ensureUniqueProductSlug: async (base: string) => base,
}))

const { processImportJob } = await import('@/modules/shop/lib/import-engine')

const SALE_CSV = 'sku,sale_price,sale_sku\r\nORION-1,149.00,ORION-1-SALE\r\n'

beforeEach(() => {
  updateProduct.mockClear(); updateImportJobProgress.mockClear()
  markImportJobCompleted.mockClear(); sendShopEmail.mockClear()
})

describe('an import that runs out of time', () => {
  it('stops before the next row and closes the job as failed, saying where', async () => {
    await processImportJob('job-1', SALE_CSV, 'owner@example.com', null, { mode: 'UPDATE_ONLY', deadline: Date.now() - 1 })
    expect(updateProduct).not.toHaveBeenCalled()
    expect(markImportJobCompleted).toHaveBeenCalledWith('job-1', 'FAILED')
    expect(markImportJobCompleted).not.toHaveBeenCalledWith('job-1', 'COMPLETED')
    const progress = updateImportJobProgress.mock.calls.at(-1)?.[1] as { processedRows: number; errors: Array<{ row: number; reason: string }> }
    expect(progress.processedRows).toBe(0)
    expect(progress.errors[0]?.row).toBe(2)
    expect(progress.errors[0]?.reason).toMatch(/Stopped at row 2/)
  })

  it('sends no "import complete" email for an import that did not complete', async () => {
    await processImportJob('job-1', SALE_CSV, 'owner@example.com', null, { mode: 'UPDATE_ONLY', deadline: Date.now() - 1 })
    expect(sendShopEmail).not.toHaveBeenCalled()
  })

  it('finishes as before when there is time to spare', async () => {
    await processImportJob('job-1', SALE_CSV, 'owner@example.com', null, { mode: 'UPDATE_ONLY', deadline: Date.now() + 60_000 })
    expect(updateProduct).toHaveBeenCalledTimes(1)
    expect(markImportJobCompleted).toHaveBeenCalledWith('job-1', 'COMPLETED')
    expect(sendShopEmail).toHaveBeenCalledTimes(1)
  })
})
