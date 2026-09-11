import { describe, expect, it } from 'vitest'
import type { Member } from '@prisma/client'
import { orderViewerFor } from '@/modules/shop/lib/order-viewer'

// Who may look at an order. A rule about access, so it is asserted in both
// directions: what it lets in, and - the half that matters - what it does not.

const member = { id: 'mem-1' } as Member

describe('orderViewerFor', () => {
  it('lets a member see their own order and nobody else see it', () => {
    expect(orderViewerFor({ id: 'ord-1', memberId: 'mem-1' }, member, [])?.kind).toBe('member')
    expect(orderViewerFor({ id: 'ord-1', memberId: 'mem-2' }, member, [])).toBeNull()
    expect(orderViewerFor({ id: 'ord-1', memberId: null }, null, [])).toBeNull()
  })

  it('lets a guest see the order whose postcode they proved, and only that one', () => {
    expect(orderViewerFor({ id: 'ord-1', memberId: null }, null, ['ord-1'])?.kind).toBe('guest')
    expect(orderViewerFor({ id: 'ord-2', memberId: null }, null, ['ord-1'])).toBeNull()
  })

  // The one this file was written for. A replacement part goes to the delivery
  // address copied off the order it puts right, so the postcode already proved
  // is the postcode of both - and without this the customer who reported the
  // broken chair is bounced to a form by the link we emailed them.
  it('opens a replacement to whoever could already open its parent', () => {
    const replacement = { id: 'ord-1-r1', memberId: null, parentOrderId: 'ord-1' }
    expect(orderViewerFor(replacement, null, ['ord-1'])?.kind).toBe('guest')
  })

  it('does not open a replacement to somebody who proved a different order', () => {
    const replacement = { id: 'ord-1-r1', memberId: null, parentOrderId: 'ord-1' }
    expect(orderViewerFor(replacement, null, ['ord-9'])).toBeNull()
    expect(orderViewerFor(replacement, null, [])).toBeNull()
  })

  it('does not open an ordinary order because some other order was proved', () => {
    // The inheritance is the parent's id, not any id: an order with no parent
    // gains nothing from the list holding somebody else's.
    expect(orderViewerFor({ id: 'ord-2', memberId: null, parentOrderId: null }, null, ['ord-1'])).toBeNull()
  })

  it('reads a payload with no parentOrderId at all as "not a replacement"', () => {
    // A response shape from before the column existed refuses rather than
    // admits, which is the safe way round for an access rule.
    expect(orderViewerFor({ id: 'ord-2', memberId: null }, null, ['ord-1'])).toBeNull()
  })
})
