import { describe, expect, it } from 'vitest'
import { receiptAnswerMatches, receiptChallengeFor } from '@/modules/shop/lib/order-receipt-challenge'
import type { ShpAddress } from '@/modules/shop/lib/types'

function order(postcode: string, customerEmail = 'buyer@example.com') {
  const shippingAddress: ShpAddress = {
    firstName: 'Ada', lastName: 'Lovelace', line1: '1 Test Street', city: 'London',
    postcode, country: 'GB',
  }
  return { customerEmail, shippingAddress }
}

describe('which question a receipt can be opened with', () => {
  it('asks for the postcode when the order has one', () => {
    expect(receiptChallengeFor(order('B29 7QB'))).toBe('postcode')
  })

  // A shop selling to somewhere that does not use postcodes still has to let
  // the customer reach their own receipt on a second device.
  it('asks for the email address when the order has no postcode', () => {
    expect(receiptChallengeFor(order(''))).toBe('email')
    expect(receiptChallengeFor(order('   '))).toBe('email')
  })
})

describe('answering the challenge', () => {
  it('accepts the postcode however it is written', () => {
    for (const typed of ['B29 7QB', 'b297qb', ' b29  7qb ', 'B29-7QB']) {
      expect(receiptAnswerMatches(order('B29 7QB'), typed)).toBe(true)
    }
  })

  it('refuses a different postcode', () => {
    expect(receiptAnswerMatches(order('B29 7QB'), 'E1 1AA')).toBe(false)
  })

  // The whole point: a blank box must never open anything, least of all an
  // order that has no postcode of its own to compare against.
  it('refuses an empty answer', () => {
    expect(receiptAnswerMatches(order('B29 7QB'), '')).toBe(false)
    expect(receiptAnswerMatches(order(''), '')).toBe(false)
    expect(receiptAnswerMatches(order(''), '   ')).toBe(false)
  })

  it('accepts the email address on a postcodeless order, whatever the case', () => {
    expect(receiptAnswerMatches(order('', 'Buyer@Example.com'), 'buyer@example.com')).toBe(true)
    expect(receiptAnswerMatches(order('', 'buyer@example.com'), '  BUYER@EXAMPLE.COM ')).toBe(true)
  })

  it('refuses a different email address', () => {
    expect(receiptAnswerMatches(order('', 'buyer@example.com'), 'someone@example.com')).toBe(false)
  })

  // `+tags` and dots are genuinely different addresses at some providers, and
  // this is a lock rather than a de-duplicator.
  it('does not treat a tagged address as the same address', () => {
    expect(receiptAnswerMatches(order('', 'buyer@example.com'), 'buyer+shop@example.com')).toBe(false)
  })

  // An order WITH a postcode is opened by the postcode and nothing else - the
  // email address is printed on every message the shop has ever sent them.
  it('does not accept the email address when the order has a postcode', () => {
    expect(receiptAnswerMatches(order('B29 7QB'), 'buyer@example.com')).toBe(false)
  })
})
