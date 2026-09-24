import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ResolvedCartLine } from '@/modules/shop/lib/checkout'
import type { ShpProduct } from '@/modules/shop/lib/types'

// The rule itself is proved next door, against plain objects. This pins the part
// that only exists in the checkout: WHERE the pass runs, and what it is forbidden
// to touch on its way past.
//
// It runs after applyMinimumOrderQuantities, over the pooled basket, so a line
// already failed by a short pool stays failed and a line that is fine stays fine.
// A price change may never change what can be bought - a deduction that quietly
// made a blocked line available again, or blocked an available one, would be a
// shop refusing orders it should take.

const config = vi.hoisted(() => vi.fn())
const rules = vi.hoisted(() => vi.fn())

vi.mock('@/modules/shop/lib/config', () => ({ getShopConfigCached: config }))
vi.mock('@/modules/shop/lib/db/suppliers', () => ({ getDeductionRules: rules }))

const { applyOrderSizeDeductions } = await import('@/modules/shop/lib/checkout')

const DYNAMIC = 'Dynamic Office Solutions'

type Opts = {
  id?: string
  supplier?: string | null
  price?: number
  salePrice?: number | null
  quantity?: number
  deduction?: string | null
  available?: boolean
  reason?: string
}

const line = ({
  id = 'p1',
  supplier = DYNAMIC,
  price = 116,
  salePrice = 116,
  quantity = 1,
  deduction = '6.00',
  available = true,
  reason,
}: Opts = {}): ResolvedCartLine => {
  // salePrice below price is what makes a product "on offer", which is the test
  // the deduction answers to - not the stamp on the row.
  const unitPrice = salePrice != null && salePrice < price ? salePrice : price
  return {
    product: {
      id,
      supplier,
      price: String(price),
      salePrice: salePrice != null ? String(salePrice) : null,
      orderSizeDeduction: deduction,
    } as ShpProduct,
    quantity,
    unitPrice,
    lineSubtotal: unitPrice * quantity,
    available,
    availabilityReason: reason,
    isPreOrder: false,
    minOrderQuantity: 1,
    minOrderPooled: false,
    returnable: true,
    returnsDiscretionary: false,
    nonReturnableNote: null,
    lineMeta: null,
    saleSku: null,
  }
}

beforeEach(() => {
  config.mockReset()
  rules.mockReset()
  config.mockResolvedValue({ orderSizeDeductionEnabled: true })
  rules.mockResolvedValue([{ supplier: DYNAMIC, threshold: 350 }])
})

describe('applyOrderSizeDeductions', () => {
  it('does nothing, and asks the database nothing, while the switch is off', async () => {
    config.mockResolvedValue({ orderSizeDeductionEnabled: false })
    const lines = [line({ price: 500, salePrice: 400, quantity: 1 })]
    const out = await applyOrderSizeDeductions(lines)
    expect(out.lines).toBe(lines)
    expect(out.states).toEqual([])
    expect(rules).not.toHaveBeenCalled()
  })

  it('asks the database nothing when no line in the basket carries an amount', async () => {
    // Including the case that would otherwise qualify: a full-price basket from a
    // supplier that HAS a rule. There is simply nothing to take off it.
    const out = await applyOrderSizeDeductions(
      [line({ price: 400, salePrice: null, deduction: null, quantity: 1 })],
    )
    expect(out.states).toEqual([])
    expect(rules).not.toHaveBeenCalled()
  })

  it('takes the money off a qualifying basket and records what came off', async () => {
    const out = await applyOrderSizeDeductions(
      [line({ price: 130, salePrice: 116, quantity: 4 })],
    )
    expect(out.lines[0]!.unitPrice).toBe(110)
    expect(out.lines[0]!.lineSubtotal).toBe(440)
    // Per unit, and already inside unitPrice - never subtracted a second time.
    expect(out.lines[0]!.orderSizeDeduction).toBe(6)
    expect(out.states[0]!.qualified).toBe(true)
    expect(out.states[0]!.saving).toBe(24)
  })

  it('leaves availability exactly as the pooling pass left it', async () => {
    const out = await applyOrderSizeDeductions(
      [
        line({ id: 'ok', price: 130, salePrice: 116, quantity: 3 }),
        line({ id: 'short', price: 130, salePrice: 116, quantity: 1, available: false, reason: 'The smallest order for this is 4 - add 3 more' }),
      ],
    )
    expect(out.states[0]!.qualified).toBe(true)
    // Both lines are repriced; neither changes hands on whether it can be bought.
    expect(out.lines[0]!.available).toBe(true)
    expect(out.lines[0]!.availabilityReason).toBeUndefined()
    expect(out.lines[1]!.available).toBe(false)
    expect(out.lines[1]!.availabilityReason).toBe('The smallest order for this is 4 - add 3 more')
    expect(out.lines[1]!.unitPrice).toBe(110)
  })

  it('leaves the pooling pass\'s own figures untouched', async () => {
    const [pooled] = [line({ price: 130, salePrice: 116, quantity: 4 })]
    pooled!.minOrderQuantity = 4
    pooled!.minOrderPooled = true
    const out = await applyOrderSizeDeductions([pooled!])
    expect(out.lines[0]!.minOrderQuantity).toBe(4)
    expect(out.lines[0]!.minOrderPooled).toBe(true)
  })

  it('takes the amount off a product that is not on offer at all', async () => {
    // The case the rule used to refuse. A supplier whose amount sits inside the
    // ORDINARY price is not a sale, and the only way to make the old rule serve
    // one was to invent a sale price for every product - which the storefront
    // then advertised as a genuine reduction, on the card and on the page.
    const out = await applyOrderSizeDeductions(
      [line({ price: 400, salePrice: null, quantity: 1 })],
    )
    expect(out.lines[0]!.unitPrice).toBe(394)
    expect(out.lines[0]!.orderSizeDeduction).toBe(6)
  })

  it('takes it off the price the line is actually charged at', async () => {
    // The pass runs on RESOLVED lines, so whichever of a product's prices the
    // shop settled on - sale, ordinary, or the ordinary one because sale prices
    // are switched off shop-wide - is already sitting in unitPrice by the time
    // the rule sees it. The stamp is a statement about that figure, so the two
    // agree by construction. What it cannot do is notice an owner who repriced
    // and left the stamp behind, which is what the Suppliers report is for.
    const out = await applyOrderSizeDeductions(
      [line({ price: 130, salePrice: 116, quantity: 1 }), line({ id: 'full', price: 400, salePrice: null, quantity: 1 })],
    )
    expect(out.lines[0]!.unitPrice).toBe(110)
    expect(out.lines[1]!.unitPrice).toBe(394)
    expect(out.states[0]!.saving).toBe(12)
  })

  it('leaves the money in a basket held back by resolver charges', async () => {
    // £360 on the line, £60 of it a delivery service the resolver attributed out.
    // £300 of goods, against a £350 threshold: the basket has not reached it.
    const held = line({ price: 400, salePrice: 360, quantity: 1 })
    held.charges = [{ label: 'Delivery', amount: 60 }]
    const out = await applyOrderSizeDeductions([held])
    expect(out.states[0]!.goodsSubtotal).toBe(300)
    expect(out.states[0]!.qualified).toBe(false)
    expect(out.lines[0]!.unitPrice).toBe(360)
  })

  it('only asks about the suppliers actually in the basket', async () => {
    await applyOrderSizeDeductions(
      [
        line({ id: 'a', supplier: DYNAMIC, price: 130, salePrice: 116 }),
        line({ id: 'b', supplier: 'Furdeco', price: 130, salePrice: 116 }),
        line({ id: 'c', supplier: null, price: 130, salePrice: 116 }),
      ],
    )
    expect(rules).toHaveBeenCalledWith([DYNAMIC, 'Furdeco'])
  })
})
