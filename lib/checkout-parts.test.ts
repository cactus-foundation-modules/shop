import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ShpProduct } from '@/modules/shop/lib/types'

// A spare part is stocked and priced like anything else, and kept out of the
// shop entirely - so a basket a shopper built may not buy one, however it got
// there, while an order staff enter by hand may. Pinned here because the two
// callers differ only by an option, and an option is easy to forget.

const products = vi.hoisted(() => vi.fn())

vi.mock('@/modules/shop/lib/db/products', () => ({ getProductsByIds: products }))
vi.mock('@/modules/shop/lib/config', () => ({
  getShopConfigCached: async () => ({ enabledPriceTypes: [], orderSizeDeductionEnabled: false }),
}))
vi.mock('@/modules/shop/lib/line-meta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/shop/lib/line-meta')>()),
  getCartLineResolvers: async () => [],
  getCartLineResolverPrefetchers: async () => [],
}))

const { resolveCartLines } = await import('@/modules/shop/lib/checkout')

const part = {
  id: 'gas-lift',
  name: 'Gas lift',
  status: 'ACTIVE',
  price: '12.00',
  salePrice: null,
  trackInventory: false,
  isPreOrder: false,
  preOrderCount: 0,
  preOrderMaxQuantity: null,
  minOrderQuantity: null,
  returnable: null,
  returnsDiscretionary: null,
  nonReturnableNote: null,
  partsOnly: true,
} as unknown as ShpProduct

beforeEach(() => {
  products.mockReset()
  products.mockResolvedValue(new Map([[part.id, part]]))
})

describe('resolveCartLines and spare parts', () => {
  it('refuses a spare part in a shopper basket, naming the line rather than dropping it', async () => {
    const [line] = await resolveCartLines([{ productId: part.id, quantity: 1 }])
    expect(line?.available).toBe(false)
    expect(line?.availabilityReason).toBe('No longer available')
  })

  it('lets staff put a spare part on an order entered by hand', async () => {
    const [line] = await resolveCartLines([{ productId: part.id, quantity: 1 }], { includeParts: true })
    expect(line?.available).toBe(true)
    expect(line?.unitPrice).toBe(12)
  })

  it('leaves an ordinary product alone', async () => {
    const chair = { ...part, id: 'chair', partsOnly: false } as ShpProduct
    products.mockResolvedValue(new Map([[chair.id, chair]]))
    const [line] = await resolveCartLines([{ productId: chair.id, quantity: 1 }])
    expect(line?.available).toBe(true)
  })
})
