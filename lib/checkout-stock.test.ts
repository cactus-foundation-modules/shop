import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ShpProduct } from '@/modules/shop/lib/types'

// Stock is per product, and a basket can hold the same product on two lines -
// two sets of options, or a personalised one beside a plain one. Checked line
// by line, each line fitted the stock on its own and the basket as a whole did
// not, so the shortfall only showed up once both had been paid for.

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

const chair = {
  id: 'chair',
  name: 'Task chair',
  status: 'ACTIVE',
  price: '120.00',
  salePrice: null,
  trackInventory: true,
  stockCount: 5,
  outOfStockBehaviour: 'BLOCK',
  isPreOrder: false,
  preOrderCount: 0,
  preOrderMaxQuantity: null,
  minOrderQuantity: null,
  returnable: null,
  returnsDiscretionary: null,
  nonReturnableNote: null,
  partsOnly: false,
} as unknown as ShpProduct

beforeEach(() => {
  products.mockReset()
  products.mockResolvedValue(new Map([[chair.id, chair]]))
})

describe('resolveCartLines stock across lines', () => {
  it('refuses two lines of one product that fit the stock apart but not together', async () => {
    const lines = await resolveCartLines([
      { productId: chair.id, quantity: 3, lineId: 'a' },
      { productId: chair.id, quantity: 3, lineId: 'b' },
    ])
    expect(lines.map((l) => l.available)).toEqual([false, false])
    expect(lines[0]?.availabilityReason).toBe('Only 5 left in stock')
  })

  it('lets two lines through when together they fit', async () => {
    const lines = await resolveCartLines([
      { productId: chair.id, quantity: 2, lineId: 'a' },
      { productId: chair.id, quantity: 3, lineId: 'b' },
    ])
    expect(lines.map((l) => l.available)).toEqual([true, true])
  })

  it('counts pre-order lines together against the pre-order cap', async () => {
    const preOrder = { ...chair, stockCount: 0, isPreOrder: true, preOrderCount: 8, preOrderMaxQuantity: 10 } as ShpProduct
    products.mockResolvedValue(new Map([[preOrder.id, preOrder]]))
    const lines = await resolveCartLines([
      { productId: preOrder.id, quantity: 1, lineId: 'a' },
      { productId: preOrder.id, quantity: 2, lineId: 'b' },
    ])
    expect(lines.every((l) => !l.available)).toBe(true)
  })
})
