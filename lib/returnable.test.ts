import { describe, it, expect } from 'vitest'
import {
  NON_RETURNABLE_DEFAULT_NOTE,
  NOTHING_RETURNABLE_REASON,
  isReturnable,
  nonReturnableNote,
  resolveReturnable,
} from '@/modules/shop/lib/returnable'
import { canRequestReturn } from '@/modules/shop/lib/order-requests'

// The whole point of the nullable column: a catalogue nobody has touched behaves
// exactly as it did before the column existed. Every regression this feature can
// cause is a variant of "a blank was read as a no".
describe('isReturnable', () => {
  it('reads a blank as returnable, not as a refusal', () => {
    expect(isReturnable(null)).toBe(true)
    expect(isReturnable(undefined)).toBe(true)
  })

  it('honours an explicit answer either way', () => {
    expect(isReturnable(true)).toBe(true)
    expect(isReturnable(false)).toBe(false)
  })
})

describe('resolveReturnable', () => {
  it('follows the listing when the variation says nothing - the usual case', () => {
    expect(resolveReturnable(null, false)).toBe(false)
    expect(resolveReturnable(null, true)).toBe(true)
    expect(resolveReturnable(null, null)).toBe(true)
  })

  it('lets one variation overrule its listing, in both directions', () => {
    // The single stock finish on an otherwise made-to-order range.
    expect(resolveReturnable(true, false)).toBe(true)
    // The single made-to-order finish on an otherwise stock range.
    expect(resolveReturnable(false, true)).toBe(false)
  })
})

describe('nonReturnableNote', () => {
  it('prefers the owner’s wording', () => {
    expect(nonReturnableNote('Cut to your measurements.')).toBe('Cut to your measurements.')
  })

  it('falls back where there is none, and where there is only whitespace', () => {
    expect(nonReturnableNote(null)).toBe(NON_RETURNABLE_DEFAULT_NOTE)
    expect(nonReturnableNote('   ')).toBe(NON_RETURNABLE_DEFAULT_NOTE)
  })
})

// canRequestReturn is what decides whether the button is offered at all, and the
// same function the endpoint re-asks. The flag has to reach it, and it has to be
// asked BEFORE the window - an order of nothing but bespoke goods that is told
// "your 30 days ran out" has been told the wrong thing.
describe('canRequestReturn with the returns flag', () => {
  const base = {
    order: { status: 'PROCESSING', paymentStatus: 'PAID' } as never,
    dispatch: [{ outstandingQty: 0, dispatchedQty: 2 }],
    lastShippedAt: new Date('2026-01-01T00:00:00Z'),
    config: { cancelRequestsEnabled: true, returnRequestsEnabled: true, returnWindowDays: 30 },
    now: new Date('2026-01-05T00:00:00Z'),
  }

  it('allows a return when the order holds something returnable', () => {
    expect(canRequestReturn({ ...base, anyReturnable: true }).allowed).toBe(true)
  })

  it('allows a return when the caller did not look - an older path must not turn into a refusal', () => {
    expect(canRequestReturn(base).allowed).toBe(true)
  })

  it('refuses, and says why, when nothing on the order can go back', () => {
    const outcome = canRequestReturn({ ...base, anyReturnable: false })
    expect(outcome.allowed).toBe(false)
    expect(outcome.allowed === false && outcome.reason).toBe(NOTHING_RETURNABLE_REASON)
  })

  it('gives the honest reason rather than a deadline that was never going to help', () => {
    // Well inside the window: without the flag this order would be allowed, so
    // the message can only be coming from the flag.
    const outcome = canRequestReturn({ ...base, anyReturnable: false })
    expect(outcome.allowed === false && outcome.reason).not.toContain('30-day')
  })
})
