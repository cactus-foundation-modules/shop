import { describe, expect, it } from 'vitest'
import {
  canRequestCancel,
  cancellableQty,
  coversWholeOrder,
  outstandingUnits,
  unrefundedCancelledUnits,
} from '@/modules/shop/lib/order-requests'

// Calling off PART of an order.
//
// A cancellation used to be one all-or-nothing question about a whole order, so
// one packed parcel or one made-to-order desk refused the lot. Both are per-line
// answers now, and the arithmetic underneath them is the thing to get right: it
// decides what a customer may ask for, what a shop may still put in a van, and
// whether the order is finished off or carries on with three of the five.
//
// Every sum here has a way of being wrong that costs somebody something real,
// so each one is written down as its own case.

describe('unrefundedCancelledUnits', () => {
  it('counts nothing once the money has gone back', () => {
    // The refund has ALREADY taken these units off the dispatch list in its own
    // right. Counting them here as well is the double-count that would quietly
    // shrink an order every time an approval and its refund went through
    // together - which is the ordinary path, not the odd one.
    expect(unrefundedCancelledUnits(2, 2)).toBe(0)
    expect(unrefundedCancelledUnits(2, 5)).toBe(0)
  })

  it('counts units called off that nobody has paid back yet', () => {
    // A shop that settles by bank transfer approves today and pays on Friday.
    // The units have to come off the order on the Monday all the same.
    expect(unrefundedCancelledUnits(2, 0)).toBe(2)
    expect(unrefundedCancelledUnits(3, 1)).toBe(2)
  })
})

describe('outstandingUnits', () => {
  const line = { quantity: 5, refundedQty: 0, dispatchedQty: 0, cancelledQty: 0 }

  it('is everything bought on an order nobody has touched', () => {
    expect(outstandingUnits(line)).toBe(5)
  })

  it('takes off what has gone out and what has been refunded', () => {
    expect(outstandingUnits({ ...line, dispatchedQty: 3 })).toBe(2)
    expect(outstandingUnits({ ...line, refundedQty: 2 })).toBe(3)
  })

  it('takes off units called off but not yet paid back', () => {
    expect(outstandingUnits({ ...line, cancelledQty: 2 })).toBe(3)
  })

  it('does not take the same cancelled units off twice when the refund goes with it', () => {
    // The whole reason unrefundedCancelledUnits exists. Approve two, refund the
    // two, and three are still to be supplied - not one.
    expect(outstandingUnits({ ...line, cancelledQty: 2, refundedQty: 2 })).toBe(3)
  })

  it('does not move when the refund catches up days later', () => {
    // Approved on Monday, paid on Friday. If the figure jumped, a shop would
    // find two units reappearing on the dispatch screen after the money went.
    const approved = outstandingUnits({ ...line, cancelledQty: 2, refundedQty: 0 })
    const paid = outstandingUnits({ ...line, cancelledQty: 2, refundedQty: 2 })
    expect(approved).toBe(3)
    expect(paid).toBe(3)
  })

  it('floors at zero rather than going negative', () => {
    expect(outstandingUnits({ quantity: 2, refundedQty: 2, dispatchedQty: 2, cancelledQty: 2 })).toBe(0)
  })
})

describe('cancellableQty', () => {
  it('offers nothing on a line the shop will not take back', () => {
    // Cut, upholstered or ordered in specially: the shop committed to it when
    // the order landed, and the van not having been yet does not put it back in
    // the box. Same flag decides both questions on purpose.
    expect(cancellableQty({ outstandingQty: 4, returnable: false })).toBe(0)
  })

  it('offers whatever is still to be supplied', () => {
    expect(cancellableQty({ outstandingQty: 4, returnable: true })).toBe(4)
  })

  it('nets off what a live request has already spoken for', () => {
    expect(cancellableQty({ outstandingQty: 4, returnable: true }, 3)).toBe(1)
    expect(cancellableQty({ outstandingQty: 4, returnable: true }, 9)).toBe(0)
  })
})

describe('coversWholeOrder', () => {
  const items = [
    { id: 'a', quantity: 2, refundedQty: 0 },
    { id: 'b', quantity: 3, refundedQty: 0 },
  ]

  it('is true for a cancellation that names nothing - "everything" is not a list', () => {
    expect(coversWholeOrder({ type: 'CANCEL', items: [] }, items)).toBe(true)
  })

  it('is true for one that names every line in full', () => {
    const request = { type: 'CANCEL' as const, items: [
      { orderItemId: 'a', quantity: 2 },
      { orderItemId: 'b', quantity: 3 },
    ] }
    expect(coversWholeOrder(request, items)).toBe(true)
  })

  it('is false when a line is left behind, or only part of one is called off', () => {
    expect(coversWholeOrder({ type: 'CANCEL', items: [{ orderItemId: 'a', quantity: 2 }] }, items)).toBe(false)
    expect(
      coversWholeOrder(
        { type: 'CANCEL', items: [{ orderItemId: 'a', quantity: 2 }, { orderItemId: 'b', quantity: 1 }] },
        items,
      ),
    ).toBe(false)
  })

  it('ignores a line that has already been refunded down to nothing', () => {
    // Nothing is left of it to call off, so it is not what stands between this
    // request and the whole order.
    const withRefunded = [...items, { id: 'c', quantity: 4, refundedQty: 4 }]
    const request = { type: 'CANCEL' as const, items: [
      { orderItemId: 'a', quantity: 2 },
      { orderItemId: 'b', quantity: 3 },
    ] }
    expect(coversWholeOrder(request, withRefunded)).toBe(true)
  })

  it('is never true of a return or a damage report, whatever they name', () => {
    const everything = [{ orderItemId: 'a', quantity: 2 }, { orderItemId: 'b', quantity: 3 }]
    expect(coversWholeOrder({ type: 'RETURN', items: everything }, items)).toBe(false)
    expect(coversWholeOrder({ type: 'DAMAGE', items: everything }, items)).toBe(false)
  })
})

// The rule the button and the endpoint share. Everything here is about the
// answer being per LINE: the refusals are only reached when nothing at all on
// the order can be called off.
describe('canRequestCancel, per line', () => {
  const base = {
    order: { status: 'PROCESSING', paymentStatus: 'PAID' } as never,
    dispatch: [{ outstandingQty: 2, dispatchedQty: 0 }],
    lastShippedAt: null,
    config: { cancelRequestsEnabled: true, returnRequestsEnabled: true, returnWindowDays: 30, damageReportsEnabled: true },
  }
  const chairs = { productName: 'Stock Chair', cancellableQty: 3, outstandingQty: 3, returnable: true }
  const desk = { productName: 'Bespoke Desk', cancellableQty: 0, outstandingQty: 1, returnable: false }

  it('allows one where a single line can still go', () => {
    expect(canRequestCancel({ ...base, cancellable: [chairs] }).allowed).toBe(true)
  })

  it('allows one on a mixed order rather than refusing the lot for the bespoke line', () => {
    // The old whole-order rule refused this outright, which left a customer with
    // three stock chairs they no longer wanted and an email to write.
    expect(canRequestCancel({ ...base, cancellable: [chairs, desk], nonCancellable: ['Bespoke Desk'] }).allowed).toBe(true)
  })

  it('allows one on a part-dispatched order for whatever has not been packed', () => {
    expect(
      canRequestCancel({
        ...base,
        dispatch: [{ outstandingQty: 3, dispatchedQty: 2 }],
        cancellable: [chairs],
      }).allowed,
    ).toBe(true)
  })

  it('names the lines when everything still to come is something we cannot unmake', () => {
    const outcome = canRequestCancel({ ...base, cancellable: [desk], nonCancellable: ['Bespoke Desk'] })
    expect(outcome.allowed).toBe(false)
    expect(outcome.allowed === false && outcome.reason).toContain('Bespoke Desk')
  })

  it('says it is a return once every last unit is in a van', () => {
    const outcome = canRequestCancel({
      ...base,
      dispatch: [{ outstandingQty: 0, dispatchedQty: 3 }],
      cancellable: [{ productName: 'Stock Chair', cancellableQty: 0, outstandingQty: 0, returnable: true }],
    })
    expect(outcome.allowed).toBe(false)
    expect(outcome.allowed === false && outcome.reason).toContain('return rather than a cancellation')
  })

  it('says there is nothing left when the order has been refunded away instead', () => {
    const outcome = canRequestCancel({
      ...base,
      dispatch: [{ outstandingQty: 0, dispatchedQty: 0 }],
      cancellable: [{ productName: 'Stock Chair', cancellableQty: 0, outstandingQty: 0, returnable: true }],
    })
    expect(outcome.allowed).toBe(false)
    expect(outcome.allowed === false && outcome.reason).toContain('nothing left')
  })

  it('still refuses outright while another request is being decided', () => {
    const outcome = canRequestCancel({
      ...base,
      cancellable: [chairs],
      openRequest: { id: 'r1' } as never,
    })
    expect(outcome.allowed).toBe(false)
    expect(outcome.allowed === false && outcome.reason).toContain('already have a request open')
  })

  it('still refuses on a shop that does its cancellations by email', () => {
    const outcome = canRequestCancel({
      ...base,
      cancellable: [chairs],
      config: { ...base.config, cancelRequestsEnabled: false },
    })
    expect(outcome.allowed).toBe(false)
  })
})
