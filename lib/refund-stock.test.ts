import { describe, expect, it } from 'vitest'
import { restockByProduct, unitsStillOnShelf, type RefundedLine, type StockLedger } from '@/modules/shop/lib/refund-stock'

// Which refunded units go back on the shelf. Every case here is a way of getting
// a stock count wrong in one direction or the other: too low and the shop turns
// away a sale it could have made, too high and it sells something it has not got.

const line = (over: Partial<RefundedLine> = {}): RefundedLine => ({
  productId: 'desk',
  isPreOrder: false,
  quantity: 3,
  refundedBefore: 0,
  dispatchedQty: 0,
  refundingQty: 1,
  ...over,
})

describe('unitsStillOnShelf', () => {
  it('puts back an undispatched unit of a normal line', () => {
    expect(unitsStillOnShelf(line({ refundingQty: 2 }))).toBe(2)
  })

  // Goodwill, a broken chair, a return still in the post: none of it puts a
  // chair back on the shelf.
  it('puts back nothing that has already gone out', () => {
    expect(unitsStillOnShelf(line({ quantity: 2, dispatchedQty: 2, refundingQty: 1 }))).toBe(0)
  })

  // Two of three dispatched, one refunded: the refund covers the one that was
  // still waiting, which is the unit the dispatch caps stop being sent.
  it('takes the undispatched units first', () => {
    expect(unitsStillOnShelf(line({ quantity: 3, dispatchedQty: 2, refundingQty: 1 }))).toBe(1)
    expect(unitsStillOnShelf(line({ quantity: 3, dispatchedQty: 2, refundingQty: 2 }))).toBe(1)
  })

  it('never puts back the same waiting unit twice across two refunds', () => {
    // First refund took the one unit that had not gone out.
    expect(unitsStillOnShelf(line({ quantity: 3, dispatchedQty: 2, refundedBefore: 1, refundingQty: 1 }))).toBe(0)
  })

  // A pre-order unit only comes off the shelf when it is dispatched, so one that
  // is refunded before then was never taken.
  it('never puts back a pre-order unit', () => {
    expect(unitsStillOnShelf(line({ isPreOrder: true, refundingQty: 2 }))).toBe(0)
  })

  it('puts back nothing for a line whose product has gone', () => {
    expect(unitsStillOnShelf(line({ productId: null }))).toBe(0)
  })
})

describe('restockByProduct', () => {
  const ledger = (entries: Record<string, StockLedger>) => new Map(Object.entries(entries))

  it('puts back what the order took and has not had back', () => {
    const plan = restockByProduct([line({ refundingQty: 2 })], ledger({ desk: { taken: 3, restored: 0 } }))
    expect(plan.get('desk')).toBe(2)
  })

  // Two shoppers paid for the last one: the second order took nothing, because
  // the count stops at nought. Refunding it must not conjure a desk.
  it('never puts back more than the order actually took', () => {
    const plan = restockByProduct([line({ refundingQty: 2 })], ledger({ desk: { taken: 1, restored: 0 } }))
    expect(plan.get('desk')).toBe(1)
  })

  it('puts back nothing on a backorder that took nothing', () => {
    const plan = restockByProduct([line({ refundingQty: 2 })], ledger({ desk: { taken: 0, restored: 0 } }))
    expect(plan.has('desk')).toBe(false)
  })

  it('counts what earlier refunds already put back', () => {
    const plan = restockByProduct([line({ refundingQty: 2 })], ledger({ desk: { taken: 3, restored: 2 } }))
    expect(plan.get('desk')).toBe(1)
  })

  // An order paid before the ledger was kept has no record of what it took.
  it('puts back nothing where there is no record of what was taken', () => {
    expect(restockByProduct([line({ refundingQty: 2 })], ledger({})).size).toBe(0)
  })

  it('adds up two lines of the same product before capping', () => {
    const plan = restockByProduct(
      [line({ quantity: 1, refundingQty: 1 }), line({ quantity: 3, refundingQty: 3 })],
      ledger({ desk: { taken: 4, restored: 0 } }),
    )
    expect(plan.get('desk')).toBe(4)
  })
})
