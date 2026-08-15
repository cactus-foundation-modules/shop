import { describe, expect, it } from 'vitest'
import { shippingTaxAmount, shippingTaxRate } from '@/modules/shop/lib/checkout'

// Tax on the delivery charge, which the checkout did not collect at all until
// this landed. Pinned hard because the failure mode is invisible: an EXCLUSIVE
// shop simply charges the customer less VAT than it owes HMRC, on every order
// with delivery on it, and nothing on the order or the receipt looks wrong.

const p2 = (n: number) => Math.round(n * 100) / 100

describe('shippingTaxRate', () => {
  it('is the goods rate on an ordinary single-rate shop', () => {
    // £1,000 of goods, all at 20%.
    expect(shippingTaxRate(1000, 1000 * 0.2)).toBeCloseTo(0.2, 10)
  })

  it('apportions by value across a mixed-rate basket', () => {
    // £300 at 20% and £100 at 0% - the delivery follows the mix, 15%.
    expect(shippingTaxRate(400, 300 * 0.2 + 100 * 0)).toBeCloseTo(0.15, 10)
  })

  it('is zero for an entirely zero-rated basket', () => {
    expect(shippingTaxRate(500, 0)).toBe(0)
  })

  it('is zero when there is nothing to average', () => {
    expect(shippingTaxRate(0, 0)).toBe(0)
  })
})

describe('shippingTaxAmount - EXCLUSIVE (Deskwell)', () => {
  it('adds VAT on top of the delivery charge', () => {
    expect(p2(shippingTaxAmount(50, 1000, 200, 'EXCLUSIVE'))).toBe(10)
  })

  it('collects nothing extra when delivery is free', () => {
    expect(shippingTaxAmount(0, 1000, 200, 'EXCLUSIVE')).toBe(0)
  })

  it('collects nothing on a zero-rated basket', () => {
    expect(shippingTaxAmount(50, 1000, 0, 'EXCLUSIVE')).toBe(0)
  })

  // The regression this whole change exists for: before it, this returned 0 and
  // the shop pocketed the difference until an accountant found it.
  it('is no longer zero on a taxable order with delivery', () => {
    expect(shippingTaxAmount(9.95, 480, 96, 'EXCLUSIVE')).toBeGreaterThan(0)
  })
})

describe('shippingTaxAmount - INCLUSIVE', () => {
  it('extracts the VAT already inside the delivery charge', () => {
    // £60 gross at 20% holds £10 of VAT.
    expect(p2(shippingTaxAmount(60, 1000, 200, 'INCLUSIVE'))).toBe(10)
  })

  it('never claims more than the charge itself', () => {
    const tax = shippingTaxAmount(60, 1000, 200, 'INCLUSIVE')
    expect(tax).toBeLessThan(60)
  })

  it('agrees with the EXCLUSIVE branch on the same net figure', () => {
    // £50 net + £10 VAT = £60 gross. Both modes should see £10 of tax.
    const exclusive = shippingTaxAmount(50, 1000, 200, 'EXCLUSIVE')
    const inclusive = shippingTaxAmount(60, 1000, 200, 'INCLUSIVE')
    expect(p2(exclusive)).toBe(p2(inclusive))
  })
})

describe('nothing moves on the shop as it stands today', () => {
  // Deskwell has no shipping rates configured at all, so every order resolves
  // shippingAmount to 0. This is the guarantee that switching the maths on
  // changes not a penny of any order the shop is currently taking.
  it('leaves an order with no delivery charge exactly where it was', () => {
    for (const mode of ['INCLUSIVE', 'EXCLUSIVE'] as const) {
      expect(shippingTaxAmount(0, 12345.67, 2469.13, mode)).toBe(0)
    }
  })
})
