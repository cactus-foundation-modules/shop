import { beforeAll, describe, expect, it } from 'vitest'
import { signOrderReceiptToken, verifyOrderReceiptToken } from '@/modules/shop/lib/order-receipt-token'

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a-test-key-that-is-at-least-32-characters-long'
})

describe('order receipt token', () => {
  it('verifies the token it issued', () => {
    const token = signOrderReceiptToken('DW000123')
    expect(verifyOrderReceiptToken('DW000123', token)).toBe(true)
  })

  // The point of the whole exercise: the order number is guessable, so the
  // token has to be what stops one order's link opening another's.
  it('refuses a token issued for a different order', () => {
    const token = signOrderReceiptToken('DW000123')
    expect(verifyOrderReceiptToken('DW000124', token)).toBe(false)
  })

  it('refuses a made-up token', () => {
    expect(verifyOrderReceiptToken('DW000123', 'not-a-token')).toBe(false)
  })

  it('refuses a missing token rather than waving it through', () => {
    expect(verifyOrderReceiptToken('DW000123', null)).toBe(false)
    expect(verifyOrderReceiptToken('DW000123', undefined)).toBe(false)
    expect(verifyOrderReceiptToken('DW000123', '')).toBe(false)
  })

  it('refuses a missing order number', () => {
    expect(verifyOrderReceiptToken('', signOrderReceiptToken('DW000123'))).toBe(false)
  })

  it('is stable, so a bookmarked receipt keeps working', () => {
    expect(signOrderReceiptToken('DW000123')).toBe(signOrderReceiptToken('DW000123'))
  })

  it('is url-safe - it travels in a query string', () => {
    expect(signOrderReceiptToken('DW000123')).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('does not carry the order number in the clear', () => {
    expect(signOrderReceiptToken('DW000123')).not.toContain('DW000123')
  })
})
