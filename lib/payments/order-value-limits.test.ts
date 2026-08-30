import { describe, expect, it } from 'vitest'
import {
  filterMethodsByOrderValue,
  isWithinOrderValueLimit,
  orderValueLimitFor,
  orderValueLimitSentence,
  type ShpOrderValueLimits,
} from '@/modules/shop/lib/payments/order-value-limits'

// The rule these pin is one somebody sets once and then never looks at again,
// and both ways of getting it wrong cost real money: a method offered above its
// provider's ceiling fails at the bank with the shopper's card details already
// typed in, and a method hidden a penny too early sends every order of exactly
// £571 down the expensive route.

const money = (amount: number) => `£${amount.toFixed(2)}`

describe('orderValueLimitFor', () => {
  it('has nothing to say about a method nobody has limited', () => {
    expect(orderValueLimitFor({}, 'STRIPE')).toBeNull()
    expect(orderValueLimitFor(undefined, 'STRIPE')).toBeNull()
  })

  it('treats a limit with both ends empty as no limit at all', () => {
    expect(orderValueLimitFor({ STRIPE: { min: null, max: null } }, 'STRIPE')).toBeNull()
  })

  it('returns the limits where either end is set', () => {
    expect(orderValueLimitFor({ STRIPE: { min: null, max: 571 } }, 'STRIPE')).toEqual({ min: null, max: 571 })
  })
})

describe('isWithinOrderValueLimit', () => {
  it('allows everything when there is no limit', () => {
    expect(isWithinOrderValueLimit(null, 10_000)).toBe(true)
  })

  it('allows everything while the total is still unknown', () => {
    // An early checkout with no delivery address on it has no total yet. The
    // server checks again when the order is actually made.
    expect(isWithinOrderValueLimit({ min: 1000, max: null }, null)).toBe(true)
  })

  it('includes both ends of the range', () => {
    const limit = { min: 100, max: 571 }
    expect(isWithinOrderValueLimit(limit, 100)).toBe(true)
    expect(isWithinOrderValueLimit(limit, 571)).toBe(true)
    expect(isWithinOrderValueLimit(limit, 99.99)).toBe(false)
    expect(isWithinOrderValueLimit(limit, 571.01)).toBe(false)
  })

  it('settles the penny on the boundary rather than leaving it to floating point', () => {
    // 571.01 is not exactly representable; compared as pounds this used to land
    // inside a £571 ceiling on some values and outside on others.
    expect(isWithinOrderValueLimit({ min: null, max: 571 }, 571.01)).toBe(false)
    expect(isWithinOrderValueLimit({ min: 571.01, max: null }, 571.01)).toBe(true)
    expect(isWithinOrderValueLimit({ min: 571.01, max: null }, 571)).toBe(false)
  })

  it('is one-ended where only one end is set', () => {
    expect(isWithinOrderValueLimit({ min: null, max: 571 }, 5)).toBe(true)
    expect(isWithinOrderValueLimit({ min: 571.01, max: null }, 5_000)).toBe(true)
  })
})

describe('filterMethodsByOrderValue', () => {
  // The pair the shop owner actually asked for: one method under the line, the
  // other over it, with no order left unable to pay for itself.
  const limits: ShpOrderValueLimits = {
    ATOA: { min: null, max: 571 },
    GOCARDLESS_IBP: { min: 571.01, max: null },
  }
  const methods = ['STRIPE', 'ATOA', 'GOCARDLESS_IBP']

  it('offers the small-order method below the line', () => {
    expect(filterMethodsByOrderValue(methods, limits, 571)).toEqual(['STRIPE', 'ATOA'])
  })

  it('offers the large-order method above it', () => {
    expect(filterMethodsByOrderValue(methods, limits, 571.01)).toEqual(['STRIPE', 'GOCARDLESS_IBP'])
  })

  it('leaves unlimited methods alone at every size', () => {
    expect(filterMethodsByOrderValue(methods, {}, 1)).toEqual(methods)
    expect(filterMethodsByOrderValue(methods, limits, null)).toEqual(methods)
  })

  it('keeps the order it was given', () => {
    expect(filterMethodsByOrderValue(['ATOA', 'STRIPE'], limits, 10)).toEqual(['ATOA', 'STRIPE'])
  })
})

describe('orderValueLimitSentence', () => {
  it('says nothing where there is no rule', () => {
    expect(orderValueLimitSentence(null, money)).toBeNull()
  })

  it('names one end where only one is set', () => {
    expect(orderValueLimitSentence({ min: null, max: 571 }, money)).toBe('orders up to £571.00')
    expect(orderValueLimitSentence({ min: 571.01, max: null }, money)).toBe('orders of £571.01 and over')
  })

  it('names both ends as a range', () => {
    expect(orderValueLimitSentence({ min: 100, max: 571 }, money)).toBe('orders from £100.00 to £571.00')
  })
})
