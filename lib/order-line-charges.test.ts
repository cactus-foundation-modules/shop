import { describe, it, expect } from 'vitest'
import { attributedLineCharges, orderChargeRows, splitOrderLine } from '@/modules/shop/lib/order-line-charges'

// The admin order screen and the invoice both take a per-item delivery charge
// back out of a line's price with these. The order that prompted it: a desk at
// £149.95 whose price carried a £12.95 delivery tier, shown as a £149.95 desk
// with delivery at £0.00.
describe('splitOrderLine', () => {
  it('takes a delivery charge out of the unit price and the line total', () => {
    const split = splitOrderLine({ quantity: 1, unitPrice: '149.95', total: '149.95', lineMeta: { charges: [{ label: 'Delivery', amount: 12.95 }] } })
    expect(split).toEqual({ goodsUnitPrice: 137, goodsTotal: 137, charges: [{ label: 'Delivery', amount: 12.95 }] })
  })

  it('multiplies the per-unit charge by the quantity', () => {
    const split = splitOrderLine({ quantity: 3, unitPrice: '100.00', total: '300.00', lineMeta: { charges: [{ label: 'Delivery', amount: 10 }] } })
    expect(split).toEqual({ goodsUnitPrice: 90, goodsTotal: 270, charges: [{ label: 'Delivery', amount: 30 }] })
  })

  it('never lets the charges claim more than the line is worth', () => {
    const split = splitOrderLine({ quantity: 1, unitPrice: '40.00', total: '40.00', lineMeta: { charges: [{ label: 'Delivery', amount: 60 }] } })
    expect(split.charges).toEqual([{ label: 'Delivery', amount: 40 }])
    expect(split.goodsTotal).toBe(0)
  })

  it('leaves a line with no charges exactly as stored', () => {
    expect(splitOrderLine({ quantity: 2, unitPrice: '25.00', total: '50.00', lineMeta: null }))
      .toEqual({ goodsUnitPrice: 25, goodsTotal: 50, charges: [] })
  })

  it('ignores a malformed charge rather than guessing at it', () => {
    expect(attributedLineCharges([{ amount: 5 }, { label: 'Delivery', amount: 'lots' }, null], 1, 100)).toEqual([])
  })
})

describe('orderChargeRows', () => {
  it('sums the lines by label, in the order they first appear', () => {
    const rows = orderChargeRows([
      { charges: [{ label: 'Delivery', amount: 12.95 }] },
      { charges: [{ label: 'Installation', amount: 50 }, { label: 'Delivery', amount: 17.95 }] },
      { charges: [] },
    ])
    expect(rows).toEqual([{ label: 'Delivery', amount: 30.9 }, { label: 'Installation', amount: 50 }])
  })
})
