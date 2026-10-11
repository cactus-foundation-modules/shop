import { describe, expect, it } from 'vitest'
import { paidPerUnit, paidPerUnitSplit, requestRefundLines, withinRemaining } from '@/modules/shop/lib/request-refund-lines'

// What approving a cancellation or return sends back. Every case here is one a
// customer holding a bank statement would notice, in one direction or the other.

const chair = { id: 'chair', quantity: 2, refundedQty: 0, unitPrice: '100.00', total: '200.00', taxAmount: '40.00' }
const desk = { id: 'desk', quantity: 1, refundedQty: 0, unitPrice: '300.00', total: '300.00', taxAmount: '60.00' }

const exclusive = { taxMode: 'EXCLUSIVE' as const, subtotal: '500.00', discountAmount: '0.00' }
const inclusive = { taxMode: 'INCLUSIVE' as const, subtotal: '500.00', discountAmount: '0.00' }

describe('paidPerUnit', () => {
  it('adds the VAT back on an EXCLUSIVE shop, where the line total is net', () => {
    // The whole bug: 100 net + 20 VAT was paid, and 100 was going back.
    expect(paidPerUnit(chair, exclusive)).toBe(120)
  })

  it('adds nothing on an INCLUSIVE shop, where the tax is already inside', () => {
    expect(paidPerUnit(chair, inclusive)).toBe(100)
  })

  it('takes an order discount off the goods but not off the tax, which was already worked out after it', () => {
    // 10% off: the chairs' 200 net became 180, and their stored tax (36) is
    // already the tax on 180. What was paid per chair is (180 + 36) / 2.
    const discounted = { taxMode: 'EXCLUSIVE' as const, subtotal: '500.00', discountAmount: '50.00' }
    expect(paidPerUnit({ ...chair, taxAmount: '36.00' }, discounted)).toBeCloseTo(108, 10)
  })

  it('takes the discount off an INCLUSIVE line too', () => {
    const discounted = { taxMode: 'INCLUSIVE' as const, subtotal: '500.00', discountAmount: '50.00' }
    expect(paidPerUnit(chair, discounted)).toBeCloseTo(90, 10)
  })

  it('never lets a nonsense discount push the goods below nothing', () => {
    const silly = { taxMode: 'INCLUSIVE' as const, subtotal: '500.00', discountAmount: '900.00' }
    expect(paidPerUnit(chair, silly)).toBe(0)
  })
})

describe('requestRefundLines', () => {
  it('prices the named lines at what was paid for them', () => {
    const lines = requestRefundLines({ items: [{ orderItemId: 'chair', quantity: 1 }] }, [chair, desk], exclusive)
    expect(lines).toEqual([{ orderItemId: 'chair', quantity: 1, amount: 120 }])
  })

  it('covers everything not already refunded when a cancellation names nothing', () => {
    const partRefunded = { ...chair, refundedQty: 1 }
    const lines = requestRefundLines({ items: [] }, [partRefunded, desk], exclusive)
    expect(lines).toEqual([
      { orderItemId: 'chair', quantity: 1, amount: 120 },
      { orderItemId: 'desk', quantity: 1, amount: 360 },
    ])
  })

  it('leaves out lines with nothing left on them', () => {
    const allGone = { ...chair, refundedQty: 2 }
    expect(requestRefundLines({ items: [] }, [allGone], exclusive)).toEqual([])
  })

  it('is unchanged on an INCLUSIVE shop with no discount - the unit price was always right there', () => {
    const lines = requestRefundLines({ items: [{ orderItemId: 'desk', quantity: 1 }] }, [chair, desk], inclusive)
    expect(lines).toEqual([{ orderItemId: 'desk', quantity: 1, amount: 300 }])
  })

  it('rounds each line to the penny', () => {
    const odd = { id: 'odd', quantity: 3, refundedQty: 0, unitPrice: '3.33', total: '10.00', taxAmount: '2.00' }
    const lines = requestRefundLines({ items: [{ orderItemId: 'odd', quantity: 1 }] }, [odd], exclusive)
    expect(lines[0]?.amount).toBe(4)
  })
})

describe('withinRemaining', () => {
  const line = (orderItemId: string, amount: number) => ({ orderItemId, quantity: 1, amount })

  it('leaves the lines alone when they fit', () => {
    const lines = [line('a', 100), line('b', 50)]
    expect(withinRemaining(lines, 150)).toEqual(lines)
    expect(withinRemaining(lines, 400)).toEqual(lines)
  })

  it('takes a rounding penny off the largest line rather than let the refund be refused', () => {
    expect(withinRemaining([line('a', 60.01), line('b', 120.02)], 180.02)).toEqual([line('a', 60.01), line('b', 120.01)])
  })

  it('moves on to the next line only once the largest has run out', () => {
    expect(withinRemaining([line('a', 10), line('b', 5)], 3)).toEqual([line('a', 0), line('b', 3)])
  })

  it('leaves a refund with nothing left to come from for the caps to refuse in their own words', () => {
    const lines = [line('a', 10)]
    expect(withinRemaining(lines, 0)).toEqual(lines)
    expect(withinRemaining(lines, -5)).toEqual(lines)
  })
})

describe('paidPerUnitSplit', () => {
  const order = { taxMode: 'INCLUSIVE' as const, subtotal: '0', discountAmount: '0' }

  it('is all goods on a line with no delivery priced into it', () => {
    const line = { quantity: 2, unitPrice: '100.00', total: '200.00', taxAmount: '33.33' }
    expect(paidPerUnitSplit(line, order)).toEqual({ goods: 100, delivery: 0 })
  })

  it('takes the per-item delivery out of what each unit paid', () => {
    // Two at 125.95 each, of which 25.95 each is delivery.
    const line = {
      quantity: 2, unitPrice: '125.95', total: '251.90', taxAmount: '41.98',
      lineMeta: { charges: [{ label: 'Delivery', amount: 25.95 }] },
    }
    const split = paidPerUnitSplit(line, order)
    expect(split.goods).toBeCloseTo(100, 2)
    expect(split.delivery).toBeCloseTo(25.95, 2)
    expect(split.goods + split.delivery).toBeCloseTo(paidPerUnit(line, order), 8)
  })

  it('shares a discount and exclusive VAT between the two in proportion', () => {
    const exclusive = { taxMode: 'EXCLUSIVE' as const, subtotal: '200.00', discountAmount: '20.00' }
    const line = {
      quantity: 1, unitPrice: '200.00', total: '200.00', taxAmount: '36.00',
      lineMeta: { charges: [{ label: 'Delivery', amount: 50 }] },
    }
    const split = paidPerUnitSplit(line, exclusive)
    // Paid: 200 less 10% = 180, plus 36 VAT = 216. A quarter of the line was delivery.
    expect(split.goods + split.delivery).toBeCloseTo(216, 8)
    expect(split.delivery).toBeCloseTo(54, 8)
  })
})
