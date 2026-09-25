import { describe, it, expect } from 'vitest'
import { cancellationRefundPlan, chargeFigures, suggestedChargeTaxRate } from '@/modules/shop/lib/order-charge-money'

// The figures an extra charge puts in front of a customer, and what cancelling
// instead sends back. Each case is one a customer would check against their
// bank statement.

describe('chargeFigures', () => {
  it('adds the tax to a fee typed before tax', () => {
    const out = chargeFigures(39, 20)
    expect(out.ok && out.figures).toEqual({ net: 39, taxRate: 20, tax: 7.8, total: 46.8 })
  })

  it('rounds the tax to the penny', () => {
    const out = chargeFigures(12.34, 20)
    expect(out.ok && out.figures.tax).toBe(2.47)
    expect(out.ok && out.figures.total).toBe(14.81)
  })

  it('charges no tax at a zero rate', () => {
    const out = chargeFigures(25, 0)
    expect(out.ok && out.figures).toEqual({ net: 25, taxRate: 0, tax: 0, total: 25 })
  })

  it('refuses nothing, a negative, or nonsense', () => {
    expect(chargeFigures(0, 20).ok).toBe(false)
    expect(chargeFigures(-5, 20).ok).toBe(false)
    expect(chargeFigures(Number.NaN, 20).ok).toBe(false)
    expect(chargeFigures(10, -1).ok).toBe(false)
    expect(chargeFigures(10, 101).ok).toBe(false)
  })
})

describe('suggestedChargeTaxRate', () => {
  it('starts from the highest rate on the order', () => {
    // Lines store a fraction; the charge wants a percentage.
    expect(suggestedChargeTaxRate([{ taxRate: '0.0500' }, { taxRate: '0.2000' }, { taxRate: '0' }])).toBe(20)
    expect(suggestedChargeTaxRate([{ taxRate: '0.1750' }])).toBe(17.5)
  })

  it('is zero on an order with no tax', () => {
    expect(suggestedChargeTaxRate([])).toBe(0)
    expect(suggestedChargeTaxRate([{ taxRate: '0.0000' }])).toBe(0)
  })
})

// DW-style order: one line, prices before VAT, free delivery.
const exclusiveOrder = { taxMode: 'EXCLUSIVE' as const, subtotal: '149.95', discountAmount: '0', shippingAmount: '0', taxAmount: '29.99', total: '179.94' }
const exclusiveItems = [{ id: 'a', quantity: 1, refundedQty: 0, unitPrice: '149.95', total: '149.95', taxAmount: '29.99' }]

describe('cancellationRefundPlan', () => {
  it('refunds what was paid, less the fee', () => {
    const plan = cancellationRefundPlan({ order: exclusiveOrder, items: exclusiveItems, refunds: [], fee: 46.8 })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.held).toBe(179.94)
    expect(plan.refund).toBe(133.14)
    expect(plan.kept).toBe(46.8)
    expect(plan.lines).toEqual([{ orderItemId: 'a', quantity: 1, amount: 133.14 }])
    expect(plan.delivery).toBe(0)
  })

  it('spreads the fee across the lines and still sums to the penny', () => {
    const order = { taxMode: 'INCLUSIVE' as const, subtotal: '100.00', discountAmount: '0', shippingAmount: '0', taxAmount: '16.67', total: '100.00' }
    const items = [
      { id: 'a', quantity: 1, refundedQty: 0, unitPrice: '33.33', total: '33.33', taxAmount: '5.56' },
      { id: 'b', quantity: 1, refundedQty: 0, unitPrice: '33.33', total: '33.33', taxAmount: '5.55' },
      { id: 'c', quantity: 1, refundedQty: 0, unitPrice: '33.34', total: '33.34', taxAmount: '5.56' },
    ]
    const plan = cancellationRefundPlan({ order, items, refunds: [], fee: 10 })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.refund).toBe(90)
    expect(Number(plan.lines.reduce((sum, line) => sum + line.amount, 0).toFixed(2))).toBe(90)
    expect(plan.lines.map((line) => line.quantity)).toEqual([1, 1, 1])
  })

  it('hands back the delivery charge in full with the goods', () => {
    const order = { taxMode: 'INCLUSIVE' as const, subtotal: '100.00', discountAmount: '0', shippingAmount: '12.00', taxAmount: '18.67', total: '112.00' }
    const items = [{ id: 'a', quantity: 1, refundedQty: 0, unitPrice: '100.00', total: '100.00', taxAmount: '16.67' }]
    const plan = cancellationRefundPlan({ order, items, refunds: [], fee: 20 })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.delivery).toBe(12)
    expect(plan.refund).toBe(92)
  })

  it('counts only what has not already gone back', () => {
    const order = { ...exclusiveOrder, total: '179.94' }
    const items = [{ id: 'a', quantity: 2, refundedQty: 1, unitPrice: '74.975', total: '149.95', taxAmount: '29.99' }]
    const plan = cancellationRefundPlan({
      order,
      items,
      refunds: [{ status: 'COMPLETED', amount: '89.97', shippingAmount: '0' }, { status: 'FAILED', amount: '50.00', shippingAmount: '0' }],
      fee: 10,
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.held).toBe(89.97)
    expect(plan.refund).toBe(79.97)
    expect(plan.lines).toEqual([{ orderItemId: 'a', quantity: 1, amount: 79.97 }])
  })

  it('refuses a fee as big as everything left', () => {
    expect(cancellationRefundPlan({ order: exclusiveOrder, items: exclusiveItems, refunds: [], fee: 179.94 }).ok).toBe(false)
    expect(cancellationRefundPlan({ order: exclusiveOrder, items: exclusiveItems, refunds: [], fee: 500 }).ok).toBe(false)
  })

  it('refuses an order already refunded in full', () => {
    const plan = cancellationRefundPlan({
      order: exclusiveOrder,
      items: [{ ...exclusiveItems[0]!, refundedQty: 1 }],
      refunds: [{ status: 'COMPLETED', amount: '179.94', shippingAmount: '0' }],
      fee: 10,
    })
    expect(plan.ok).toBe(false)
  })
})
