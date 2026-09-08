import { describe, it, expect } from 'vitest'
import {
  DISCRETIONARY_DEFAULT_NOTE,
  NON_RETURNABLE_DEFAULT_NOTE,
  NOTHING_RETURNABLE_REASON,
  isReturnable,
  nonReturnableNote,
  resolveDiscretionary,
  resolveReturnable,
  returnsPolicy,
  returnsPolicyNote,
} from '@/modules/shop/lib/returnable'
import {
  SHP_RETURN_REASONS,
  canReportDamage,
  canRequestCancel,
  canRequestReturn,
  isValidReason,
  reasonLabel,
} from '@/modules/shop/lib/order-requests'

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

// The reason a customer is given has to survive the trip onto their order. The
// trap this pins down: an order line's product is the hidden VARIATION CHILD,
// which never carries a reason - the owner writes one on the listing - so
// anything that reads the note back off the line's own product hands every
// variation the stock sentence and quietly loses the owner's own words.
describe('the wording that reaches the customer', () => {
  // What lib/checkout.ts does, spelled out: the line's own row first, then the
  // listing's through the cart-line resolver.
  const snapshot = (
    rowNote: string | null,
    resolverNote: string | null | undefined,
  ): string => nonReturnableNote(rowNote ?? resolverNote ?? null)

  it('takes the listing’s wording for a variation, which carries none of its own', () => {
    expect(snapshot(null, 'Cut to your measurements.')).toBe('Cut to your measurements.')
  })

  it('lets a line’s own wording win, matching the flag’s child-over-parent rule', () => {
    expect(snapshot('This finish only.', 'Cut to your measurements.')).toBe('This finish only.')
  })

  it('falls back to the stock sentence when neither wrote one', () => {
    expect(snapshot(null, null)).toBe(NON_RETURNABLE_DEFAULT_NOTE)
    expect(snapshot(null, undefined)).toBe(NON_RETURNABLE_DEFAULT_NOTE)
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
    config: { cancelRequestsEnabled: true, returnRequestsEnabled: true, returnWindowDays: 30, damageReportsEnabled: true },
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

// The third answer. Two stored columns, read in one order, and the order is the
// whole of the safety: a refusal outranks a discretion, so nothing can promise a
// return on goods the shop does not take back.
describe('returnsPolicy', () => {
  it('reads a pair of blanks as the ordinary policy', () => {
    expect(returnsPolicy(null, null)).toBe('ALLOWED')
  })

  it('reads a discretion on an otherwise blank product', () => {
    expect(returnsPolicy(null, true)).toBe('DISCRETIONARY')
  })

  it('lets a refusal outrank a discretion, never the other way about', () => {
    expect(returnsPolicy(false, true)).toBe('NONE')
  })

  it('reads an explicit yes with no discretion as the ordinary policy', () => {
    expect(returnsPolicy(true, false)).toBe('ALLOWED')
  })
})

describe('resolveDiscretionary', () => {
  it('follows the listing where the child says nothing', () => {
    expect(resolveDiscretionary(null, true)).toBe(true)
    expect(resolveDiscretionary(undefined, true)).toBe(true)
  })

  it('lets a child overrule its listing in both directions', () => {
    expect(resolveDiscretionary(false, true)).toBe(false)
    expect(resolveDiscretionary(true, false)).toBe(true)
  })

  it('reads two blanks as no discretion, which is what an untouched catalogue is', () => {
    expect(resolveDiscretionary(null, null)).toBe(false)
  })
})

describe('returnsPolicyNote', () => {
  it('says nothing at all about a line that simply comes back', () => {
    expect(returnsPolicyNote('ALLOWED', 'anything at all')).toBeNull()
  })

  it("uses the owner's own wording on both of the answers that need one", () => {
    expect(returnsPolicyNote('NONE', 'Cut to your measurements.')).toBe('Cut to your measurements.')
    expect(returnsPolicyNote('DISCRETIONARY', 'Ask us nicely.')).toBe('Ask us nicely.')
  })

  it('falls back to a different stock sentence for each, never the wrong one', () => {
    expect(returnsPolicyNote('NONE', null)).toBe(NON_RETURNABLE_DEFAULT_NOTE)
    expect(returnsPolicyNote('DISCRETIONARY', null)).toBe(DISCRETIONARY_DEFAULT_NOTE)
    expect(returnsPolicyNote('DISCRETIONARY', '   ')).toBe(DISCRETIONARY_DEFAULT_NOTE)
  })
})

// Damage is not a return reason any more, and this is the pair of rules that
// keeps that true without rewriting history.
describe('the return reasons a customer is offered', () => {
  it('does not offer damage as a reason to send something back', () => {
    // Widened deliberately: the list is `as const`, so comparing a member of it
    // to a code it no longer holds is a type error rather than the assertion
    // this is meant to be.
    const offered: ReadonlyArray<{ code: string }> = SHP_RETURN_REASONS
    expect(offered.some((r) => r.code === 'FAULTY')).toBe(false)
    expect(isValidReason('RETURN', 'FAULTY')).toBe(false)
  })

  it('still reads an old request that was raised under the old list', () => {
    expect(reasonLabel('RETURN', 'FAULTY')).toBe('It arrived damaged or faulty')
  })

  it('offers damage its own list, where a fault means the start of a replacement', () => {
    expect(isValidReason('DAMAGE', 'FAULTY')).toBe(true)
    expect(reasonLabel('DAMAGE', 'FAULTY')).toBe('It has developed a fault')
  })

  it('leaves an unknown code as itself rather than inventing a sentence for it', () => {
    expect(reasonLabel('RETURN', 'WHAT_IS_THIS')).toBe('WHAT_IS_THIS')
  })
})

// Goods a shop will not take back are goods it committed to when the order
// landed, so calling the order off is no more possible than sending it back.
describe('canRequestCancel with non-returnable goods on the order', () => {
  const base = {
    order: { status: 'PROCESSING', paymentStatus: 'PAID' } as never,
    dispatch: [{ outstandingQty: 2, dispatchedQty: 0 }],
    lastShippedAt: null,
    config: { cancelRequestsEnabled: true, returnRequestsEnabled: true, returnWindowDays: 30, damageReportsEnabled: true },
  }

  it('allows a cancellation on an ordinary undispatched order', () => {
    expect(canRequestCancel({ ...base, nonCancellable: [] }).allowed).toBe(true)
  })

  it('allows one when the caller did not look, so an older path is not turned into a refusal', () => {
    expect(canRequestCancel(base).allowed).toBe(true)
  })

  it('refuses when something on the order is not the sort of thing that comes back', () => {
    const outcome = canRequestCancel({ ...base, nonCancellable: ['Bespoke Desk'] })
    expect(outcome.allowed).toBe(false)
    expect(outcome.allowed === false && outcome.reason).toContain('Bespoke Desk')
  })

  it('still says "it is a return now" first once a parcel has gone', () => {
    const outcome = canRequestCancel({
      ...base,
      dispatch: [{ outstandingQty: 0, dispatchedQty: 2 }],
      nonCancellable: ['Bespoke Desk'],
    })
    expect(outcome.allowed === false && outcome.reason).toContain('dispatched')
  })
})

// The loosest of the three rules, on purpose: a fault does not read a calendar,
// and the customer who cannot send a thing back is the one who most needs to be
// able to say it turned up broken.
describe('canReportDamage', () => {
  const base = {
    order: { status: 'PROCESSING', paymentStatus: 'PAID' } as never,
    dispatch: [{ outstandingQty: 0, dispatchedQty: 2 }],
    lastShippedAt: new Date('2026-01-01T00:00:00Z'),
    config: { cancelRequestsEnabled: true, returnRequestsEnabled: true, returnWindowDays: 30, damageReportsEnabled: true },
    now: new Date('2027-06-01T00:00:00Z'),
  }

  it('allows a report long after any return window has shut', () => {
    expect(canReportDamage(base).allowed).toBe(true)
  })

  it('allows one on an order holding nothing the shop takes back', () => {
    expect(canReportDamage({ ...base, anyReturnable: false }).allowed).toBe(true)
  })

  it('allows one while a return is still being decided', () => {
    expect(canReportDamage({ ...base, openRequest: { id: 'r1' } as never }).allowed).toBe(true)
  })

  it('refuses a second report while the first is open', () => {
    expect(canReportDamage({ ...base, openDamageRequest: { id: 'r1' } as never }).allowed).toBe(false)
  })

  it('refuses before anything has arrived to be damaged', () => {
    const outcome = canReportDamage({ ...base, dispatch: [{ outstandingQty: 2, dispatchedQty: 0 }] })
    expect(outcome.allowed).toBe(false)
    expect(outcome.allowed === false && outcome.reason).toContain('dispatched')
  })

  it('refuses when the shop would rather hear about it by email', () => {
    expect(canReportDamage({ ...base, config: { ...base.config, damageReportsEnabled: false } }).allowed).toBe(false)
  })
})
