// What the STRUCTURED DATA is quoted in, as opposed to what the storefront
// prints. The two are the same figure on most shops and deliberately different
// on a trade catalogue, and the difference is the whole reason this exists:
// a shop printing "£126.00 ex. VAT" still has to publish £151.20 to a shopping
// channel, or a perfectly correct feed row gets pulled for a price mismatch.
import { describe, it, expect } from 'vitest'
import { makeGrossAdjuster, type TaxDisplay } from '@/modules/shop/lib/tax-display'

const VAT = 'tax-standard'

function taxDisplay(mode: TaxDisplay['display']['mode'], storedIncludesTax: boolean, rate = 0.2): TaxDisplay {
  return { display: { mode, storedIncludesTax, suffix: '' }, rates: new Map([[VAT, rate]]) }
}

describe('makeGrossAdjuster', () => {
  it('grosses up a shop that stores net and prints net', () => {
    // Deskwell's shape: a trade catalogue, prices typed in without VAT and shown
    // without it. The markup must still say what a shopper pays.
    const adjust = makeGrossAdjuster(taxDisplay('EXCLUSIVE', false), VAT)
    expect(adjust).not.toBeNull()
    expect(adjust?.(126)).toBe(151.2)
    expect(adjust?.(32)).toBe(38.4)
  })

  it('grosses up a shop that stores net and has left the setting alone', () => {
    // 'AS_ENTERED' prints exactly what is stored, so a net catalogue prints net
    // without ever touching the tax setting. The markup still owes Google gross.
    const adjust = makeGrossAdjuster(taxDisplay('AS_ENTERED', false), VAT)
    expect(adjust?.(100)).toBe(120)
  })

  it('leaves a shop that already stores gross alone', () => {
    // The ordinary shop. Null means "nothing to map", so the caller skips the
    // conversion entirely rather than multiplying every figure by one.
    expect(makeGrossAdjuster(taxDisplay('AS_ENTERED', true), VAT)).toBeNull()
    expect(makeGrossAdjuster(taxDisplay('INCLUSIVE', true), VAT)).toBeNull()
  })

  it('still publishes gross on a shop that stores gross but prints net', () => {
    // The mirror image of the trade catalogue: figures typed with VAT, shown
    // without. Nothing to convert - the stored figure IS the gross one.
    expect(makeGrossAdjuster(taxDisplay('EXCLUSIVE', true), VAT)).toBeNull()
  })

  it('leaves a zero-rated line alone whatever the setting says', () => {
    expect(makeGrossAdjuster(taxDisplay('EXCLUSIVE', false, 0), VAT)).toBeNull()
  })

  it('leaves a product with no tax class alone', () => {
    expect(makeGrossAdjuster(taxDisplay('EXCLUSIVE', false), null)).toBeNull()
  })

  it('rounds to the penny the same way every other price does', () => {
    // 12.49 * 1.2 = 14.987999... - the markup and the feed must both say 14.99,
    // because a penny of drift is the mismatch this whole thing is avoiding.
    const adjust = makeGrossAdjuster(taxDisplay('EXCLUSIVE', false), VAT)
    expect(adjust?.(12.49)).toBe(14.99)
  })
})
