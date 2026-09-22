import { describe, expect, it } from 'vitest'
import { deliveryGross, deliveryRefundTax, deliveryTax, refundableDelivery } from '@/modules/shop/lib/refund-delivery'

// Delivery as refund money: tax and all, whichever way the shop stores it, and
// never more than is left of it.

const lines = [{ taxAmount: '20.00' }, { taxAmount: '10.00' }]

describe('delivery as refund money', () => {
  it('adds the VAT back on to an EXCLUSIVE shop\'s net delivery charge', () => {
    // £150 of goods carrying £30 VAT, and a £10 delivery charge carrying £2.
    const order = { taxMode: 'EXCLUSIVE', shippingAmount: '10.00', taxAmount: '32.00' }
    expect(deliveryTax(order, lines)).toBe(2)
    expect(deliveryGross(order, lines)).toBe(12)
  })

  it('takes an INCLUSIVE shop\'s delivery charge as it stands - the VAT is already in it', () => {
    const order = { taxMode: 'INCLUSIVE', shippingAmount: '12.00', taxAmount: '32.00' }
    expect(deliveryTax(order, lines)).toBe(2)
    expect(deliveryGross(order, lines)).toBe(12)
  })

  it('is nothing at all on an order with no delivery charge, whatever the rounding left over', () => {
    const order = { taxMode: 'EXCLUSIVE', shippingAmount: '0.00', taxAmount: '30.01' }
    expect(deliveryTax(order, lines)).toBe(0)
    expect(deliveryGross(order, lines)).toBe(0)
  })

  it('takes off what has already gone back, counting refunds still in flight', () => {
    const order = { taxMode: 'EXCLUSIVE', shippingAmount: '10.00', taxAmount: '32.00' }
    expect(refundableDelivery(order, lines, [])).toBe(12)
    expect(refundableDelivery(order, lines, [{ status: 'COMPLETED', shippingAmount: '5.00' }])).toBe(7)
    expect(refundableDelivery(order, lines, [{ status: 'PENDING', shippingAmount: '12.00' }])).toBe(0)
    // A refund that failed handed nothing back.
    expect(refundableDelivery(order, lines, [{ status: 'FAILED', shippingAmount: '12.00' }])).toBe(12)
  })

  it('works out the VAT inside a delivery refund in the proportion it was charged', () => {
    const order = { taxMode: 'EXCLUSIVE', shippingAmount: '10.00', taxAmount: '32.00' }
    expect(deliveryRefundTax(order, lines, 12)).toBe(2)
    expect(deliveryRefundTax(order, lines, 6)).toBe(1)
    expect(deliveryRefundTax(order, lines, 0)).toBe(0)
  })
})
