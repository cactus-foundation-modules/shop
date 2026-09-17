import { describe, expect, it } from 'vitest'
import { computeBasketTotals } from '@/modules/shop/lib/cart-basket-totals'

describe('computeBasketTotals', () => {
  it('splits goods from named charges and sums VAT inclusively', () => {
    const totals = computeBasketTotals(
      [
        { lineSubtotal: 36, taxRate: 0.2, charges: [{ label: 'Delivery', amount: 8 }] },
        { lineSubtotal: 42.5, taxRate: 0.2 },
      ],
      'INCLUSIVE',
    )
    expect(totals.subtotal).toBe(70.5)
    expect(totals.chargeRows).toEqual([{ label: 'Delivery', amount: 8 }])
    expect(totals.lineTotal).toBe(78.5)
    expect(totals.taxAmount).toBeCloseTo(13.08, 2)
    expect(totals.total).toBe(78.5)
  })

  it('adds VAT on top when prices are shown exclusive', () => {
    const totals = computeBasketTotals([{ lineSubtotal: 100, taxRate: 0.2 }], 'EXCLUSIVE')
    expect(totals.subtotal).toBe(100)
    expect(totals.taxAmount).toBe(20)
    expect(totals.total).toBe(120)
  })
})
