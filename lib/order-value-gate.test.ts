import { describe, expect, it } from 'vitest'
import { shopOrderValueRefusal } from '@/modules/shop/lib/order-value-gate'

// The shop-wide minimum and maximum, measured on the goods before any discount
// and before delivery - so a coupon can never be what stops an order.

const limits = (min: number | null, max: number | null) => ({ minimumOrderValue: min, maximumOrderValue: max, currencySymbol: '£' })

describe('shopOrderValueRefusal', () => {
  it('lets everything through when no limit is set', () => {
    expect(shopOrderValueRefusal(limits(null, null), { subtotal: 0.01 })).toBeNull()
    expect(shopOrderValueRefusal(limits(null, null), { subtotal: 99999 })).toBeNull()
  })

  it('measures the minimum on the goods before any discount', () => {
    expect(shopOrderValueRefusal(limits(50, null), { subtotal: 40 }))
      .toBe('The minimum order is £50.00 of goods, before any discount and not counting delivery.')
    // A £60 basket with £20 off is still a £60 order here, so a coupon cannot
    // lock the shopper out of a checkout they had already reached.
    expect(shopOrderValueRefusal(limits(50, null), { subtotal: 60 })).toBeNull()
  })

  it('measures the maximum the same way', () => {
    expect(shopOrderValueRefusal(limits(null, 1000), { subtotal: 1000 })).toBeNull()
    expect(shopOrderValueRefusal(limits(null, 1000), { subtotal: 1000.01 }))
      .toBe('The maximum order is £1,000.00 of goods, before any discount and not counting delivery.')
  })

  it('treats a basket exactly on the line as on it, whatever the floats say', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in floating point.
    expect(shopOrderValueRefusal(limits(0.3, 0.3), { subtotal: 0.1 + 0.2 })).toBeNull()
  })
})
