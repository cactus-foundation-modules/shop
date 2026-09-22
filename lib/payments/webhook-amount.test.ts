import { describe, expect, it } from 'vitest'
import { decimalToMinorUnits, paidAmountMismatchNote } from '@/modules/shop/lib/payments/webhook-amount'

// Checking a payment webhook's money against the order it names. A mismatch is
// written on the order rather than refused, so what matters here is that a
// genuine match is never flagged and a real difference always is.

describe('decimalToMinorUnits', () => {
  it.each([
    ['123.45', 12345],
    ['123.4', 12340],
    ['123', 12300],
    ['0.01', 1],
    ['1600.00', 160000],
    ['19.990', 1999],
  ])('reads %s as %i pence', (value, pence) => {
    expect(decimalToMinorUnits(value)).toBe(pence)
  })

  // 0.1 + 0.2 is the reason this never goes near a float.
  it('is exact where a float is not', () => {
    expect(decimalToMinorUnits('0.30')).toBe(30)
    expect(decimalToMinorUnits('1234567.89')).toBe(123456789)
  })

  it.each(['', 'abc', '-5.00', '1,600.00', '12.345', '1e3'])('refuses %j', (value) => {
    expect(decimalToMinorUnits(value)).toBeNull()
  })
})

describe('paidAmountMismatchNote', () => {
  const order = { total: '249.99', currency: 'GBP' }

  it('says nothing when the payment matches', () => {
    expect(paidAmountMismatchNote(order, { minorUnits: 24999, currency: 'gbp' }, '£')).toBeNull()
  })

  it('says nothing when the provider did not report an amount', () => {
    expect(paidAmountMismatchNote(order, undefined, '£')).toBeNull()
  })

  it('names both figures when the amount differs', () => {
    const note = paidAmountMismatchNote(order, { minorUnits: 100, currency: 'GBP' }, '£')
    expect(note).toContain('£1.00')
    expect(note).toContain('£249.99')
  })

  it('names both currencies when the currency differs', () => {
    const note = paidAmountMismatchNote(order, { minorUnits: 24999, currency: 'usd' }, '£')
    expect(note).toContain('USD')
    expect(note).toContain('GBP')
  })

  it('flags an overpayment as well as a shortfall', () => {
    expect(paidAmountMismatchNote(order, { minorUnits: 25000, currency: 'GBP' }, '£')).not.toBeNull()
  })
})
