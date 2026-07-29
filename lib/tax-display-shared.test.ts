import { describe, it, expect } from 'vitest'
import {
  displayAmount,
  displayIncludesTax,
  displayOrderTotals,
  displayPriceFactor,
  displayTaxMode,
  withPriceSuffix,
  type PriceDisplay,
} from '@/modules/shop/lib/tax-display-shared'

// The arithmetic behind "show my prices with tax". It decides what every price
// on the storefront reads, and it is a multiply in one direction and a divide in
// the other, so the cases worth pinning are the ones where those must NOT happen.

const net = (mode: PriceDisplay['mode']): PriceDisplay => ({ mode, storedIncludesTax: false, suffix: '' })
const gross = (mode: PriceDisplay['mode']): PriceDisplay => ({ mode, storedIncludesTax: true, suffix: '' })

describe('displayPriceFactor', () => {
  it('leaves prices alone when the shop has not chosen a side', () => {
    expect(displayPriceFactor(net('AS_ENTERED'), 0.2)).toBe(1)
    expect(displayPriceFactor(gross('AS_ENTERED'), 0.2)).toBe(1)
  })

  it('leaves prices alone when the stored figures are already on the wanted side', () => {
    expect(displayPriceFactor(net('EXCLUSIVE'), 0.2)).toBe(1)
    expect(displayPriceFactor(gross('INCLUSIVE'), 0.2)).toBe(1)
  })

  it('adds tax to net prices and strips it from gross ones', () => {
    expect(displayPriceFactor(net('INCLUSIVE'), 0.2)).toBeCloseTo(1.2, 10)
    expect(displayPriceFactor(gross('EXCLUSIVE'), 0.2)).toBeCloseTo(1 / 1.2, 10)
  })

  it('never converts a zero-rated line, whatever the setting says', () => {
    expect(displayPriceFactor(net('INCLUSIVE'), 0)).toBe(1)
    expect(displayPriceFactor(net('INCLUSIVE'), Number.NaN)).toBe(1)
  })
})

describe('displayAmount', () => {
  it('grosses a net price up to the penny', () => {
    expect(displayAmount(299, net('INCLUSIVE'), 0.2)).toBe(358.8)
    expect(displayAmount(10.01, net('INCLUSIVE'), 0.2)).toBe(12.01)
  })

  it('strips tax back off a gross price', () => {
    expect(displayAmount(358.8, gross('EXCLUSIVE'), 0.2)).toBe(299)
  })

  it('round-trips a converted figure back to what was stored', () => {
    expect(displayAmount(displayAmount(50, net('INCLUSIVE'), 0.2), gross('EXCLUSIVE'), 0.2)).toBe(50)
  })
})

describe('displayIncludesTax / displayTaxMode', () => {
  it('follows the storage mode when left as entered', () => {
    expect(displayIncludesTax(net('AS_ENTERED'))).toBe(false)
    expect(displayTaxMode(net('AS_ENTERED'))).toBe('EXCLUSIVE')
    expect(displayTaxMode(gross('AS_ENTERED'))).toBe('INCLUSIVE')
  })

  it('reports the DISPLAY side once one is chosen, not the storage one', () => {
    // The case this whole setting exists for: prices kept net, quoted gross. A
    // basket handed converted lines must add up like an inclusive shop's.
    expect(displayTaxMode(net('INCLUSIVE'))).toBe('INCLUSIVE')
    expect(displayTaxMode(gross('EXCLUSIVE'))).toBe('EXCLUSIVE')
  })
})

describe('displayOrderTotals', () => {
  const totals = { subtotal: 100, taxAmount: 20, goodsSubtotal: 80, charges: [{ label: 'Delivery', amount: 20 }] }

  it('passes the rows through untouched when nothing needs converting', () => {
    expect(displayOrderTotals(totals, net('AS_ENTERED'))).toEqual({
      subtotal: 100, goodsSubtotal: 80, charges: [{ label: 'Delivery', amount: 20 }], taxIncluded: false,
    })
  })

  it('grosses the rows up so the column still lands on the server total', () => {
    const shown = displayOrderTotals(totals, net('INCLUSIVE'))
    expect(shown.subtotal).toBe(120)
    expect(shown.taxIncluded).toBe(true)
    // Subtotal - discount + shipping must still equal what the card is charged:
    // the conversion only moves money between the rows, never into or out of them.
    expect(shown.goodsSubtotal + shown.charges.reduce((s, c) => s + c.amount, 0)).toBe(shown.subtotal)
  })

  it('strips tax back out of the rows the other way', () => {
    const shown = displayOrderTotals({ subtotal: 120, taxAmount: 20 }, gross('EXCLUSIVE'))
    expect(shown.subtotal).toBe(100)
    expect(shown.taxIncluded).toBe(false)
  })

  it('leaves an empty or untaxed order alone rather than dividing by nothing', () => {
    expect(displayOrderTotals({ subtotal: 0, taxAmount: 0 }, net('INCLUSIVE')).subtotal).toBe(0)
    expect(displayOrderTotals({ subtotal: 40, taxAmount: 0 }, net('INCLUSIVE')).subtotal).toBe(40)
  })
})

describe('withPriceSuffix', () => {
  it('appends the wording, and nothing at all when there is none', () => {
    expect(withPriceSuffix('£120.00', 'inc. VAT')).toBe('£120.00 inc. VAT')
    expect(withPriceSuffix('£120.00', '')).toBe('£120.00')
  })
})
