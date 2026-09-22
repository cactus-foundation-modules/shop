import { describe, expect, it } from 'vitest'
import {
  canReportDamage,
  canRequestCancel,
  canRequestReturn,
  damagePhotoFolderPath,
  heldUnits,
  pendingRequestUnits,
  returnableQty,
} from '@/modules/shop/lib/order-requests'
import type { ShpOrderRequestWithItems } from '@/modules/shop/lib/types'

// What a customer may still ask for once some of the money has already gone
// back. A part-refunded order is not a closed one - the chairs that were not
// refunded are still chairs - so none of these is answered off the order's
// status alone. Each case is a customer who would otherwise be offered a form
// that refuses them, or refused a form they are entitled to.

describe('heldUnits', () => {
  it('is what arrived, when nothing has been paid back', () => {
    expect(heldUnits({ quantity: 2, dispatchedQty: 2, refundedQty: 0 })).toBe(2)
  })

  it('takes a refund off the units that never went out before the ones that did', () => {
    // Two ordered, one called off and refunded, the other delivered. The
    // customer is holding one chair and has paid for it.
    expect(heldUnits({ quantity: 2, dispatchedQty: 1, refundedQty: 1 })).toBe(1)
  })

  it('takes a refund off what arrived once there is nothing undelivered left to absorb it', () => {
    // Both delivered, one sent back and refunded.
    expect(heldUnits({ quantity: 2, dispatchedQty: 2, refundedQty: 1 })).toBe(1)
  })

  it('is nothing once every unit has been paid back', () => {
    expect(heldUnits({ quantity: 2, dispatchedQty: 2, refundedQty: 2 })).toBe(0)
    expect(heldUnits({ quantity: 2, dispatchedQty: 0, refundedQty: 0 })).toBe(0)
  })
})

describe('returnableQty', () => {
  it('lets the delivered half of a part-cancelled line go back', () => {
    // The bug this replaced: dispatched (1) less refunded (1) said nothing was
    // left, though the refund was for the chair that never left the building.
    expect(returnableQty({ quantity: 2, dispatchedQty: 1 }, 1)).toBe(1)
  })

  it('still nets off what a waiting return has already spoken for', () => {
    expect(returnableQty({ quantity: 3, dispatchedQty: 3 }, 1, 1)).toBe(1)
    expect(returnableQty({ quantity: 3, dispatchedQty: 3 }, 1, 5)).toBe(0)
  })

  it('counts a returned-and-refunded unit once, not twice', () => {
    // Two chairs delivered, one sent back, approved and refunded: the customer
    // still holds the other and may return it.
    expect(returnableQty({ quantity: 2, dispatchedQty: 2 }, 1, 0, 1)).toBe(1)
    // Approved but not refunded yet: the returned chair is still off the table.
    expect(returnableQty({ quantity: 2, dispatchedQty: 2 }, 0, 0, 1)).toBe(1)
    // Both returned and refunded: nothing left to send.
    expect(returnableQty({ quantity: 2, dispatchedQty: 2 }, 2, 0, 2)).toBe(0)
  })
})

const config = { cancelRequestsEnabled: true, returnRequestsEnabled: true, returnWindowDays: 30, damageReportsEnabled: true }
const base = {
  order: { status: 'PARTIALLY_REFUNDED', paymentStatus: 'PAID' } as never,
  dispatch: [{ outstandingQty: 0, dispatchedQty: 2 }],
  lastShippedAt: new Date('2026-01-01T00:00:00Z'),
  config,
  now: new Date('2026-01-05T00:00:00Z'),
}

describe('canRequestReturn on a part-refunded order', () => {
  it('still allows a return of the lines that have not been paid back', () => {
    expect(canRequestReturn({ ...base, returnLines: [{ returnableQty: 0 }, { returnableQty: 1 }] }).allowed).toBe(true)
  })

  it('says so, rather than offering an empty form, when everything that could go back already has', () => {
    const outcome = canRequestReturn({ ...base, returnLines: [{ returnableQty: 0 }, { returnableQty: 0 }] })
    expect(outcome.allowed).toBe(false)
    expect(outcome.allowed === false && outcome.reason).toContain('already being returned or has been refunded')
  })

  it('tells that to an order whose window has also closed, rather than quoting a deadline that would not help', () => {
    const late = { ...base, now: new Date('2026-03-01T00:00:00Z') }
    const outcome = canRequestReturn({ ...late, returnLines: [{ returnableQty: 0 }] })
    expect(outcome.allowed === false && outcome.reason).not.toContain('30-day')
  })

  it('keeps today\'s answer for a caller that has not worked the lines out', () => {
    expect(canRequestReturn(base).allowed).toBe(true)
  })
})

describe('canRequestCancel on a part-refunded order', () => {
  it('still lets the lines on the shelf be called off', () => {
    const outcome = canRequestCancel({
      ...base,
      dispatch: [{ outstandingQty: 1, dispatchedQty: 0 }],
      cancellable: [{ productName: 'Chair', cancellableQty: 1, outstandingQty: 1, returnable: true }],
    })
    expect(outcome.allowed).toBe(true)
  })
})

describe('canReportDamage once money has gone back', () => {
  it('stays open on a part-refunded order - a refund on one line says nothing about a fault on the next', () => {
    expect(canReportDamage(base).allowed).toBe(true)
  })

  it('closes on an order refunded in full, and says why', () => {
    const outcome = canReportDamage({ ...base, order: { status: 'REFUNDED', paymentStatus: 'REFUNDED' } as never })
    expect(outcome.allowed).toBe(false)
    expect(outcome.allowed === false && outcome.reason).toContain('refunded in full')
  })
})

describe('pendingRequestUnits', () => {
  const request = (
    type: ShpOrderRequestWithItems['type'],
    status: ShpOrderRequestWithItems['status'],
    items: Array<{ orderItemId: string; quantity: number }>,
  ) => ({ type, status, items: items.map((item, i) => ({ id: `ri-${i}`, requestId: 'r', ...item })) })

  const lines = [
    { orderItemId: 'chair', outstandingQty: 3 },
    { orderItemId: 'desk', outstandingQty: 1 },
  ]

  it('counts what an undecided cancellation or return has asked about, line by line', () => {
    const out = pendingRequestUnits(
      [request('CANCEL', 'PENDING', [{ orderItemId: 'chair', quantity: 2 }]), request('RETURN', 'PENDING', [{ orderItemId: 'desk', quantity: 1 }])],
      lines,
    )
    expect(out.get('chair')).toEqual({ cancel: 2, return: 0 })
    expect(out.get('desk')).toEqual({ cancel: 0, return: 1 })
  })

  it('reads a cancellation naming no lines as asking for everything still to go out', () => {
    const out = pendingRequestUnits([request('CANCEL', 'PENDING', [])], lines)
    expect(out.get('chair')).toEqual({ cancel: 3, return: 0 })
    expect(out.get('desk')).toEqual({ cancel: 1, return: 0 })
  })

  it('ignores anything already decided, and damage reports, which ask for nothing to be held back', () => {
    const out = pendingRequestUnits(
      [
        request('CANCEL', 'APPROVED', [{ orderItemId: 'chair', quantity: 1 }]),
        request('CANCEL', 'DECLINED', [{ orderItemId: 'chair', quantity: 1 }]),
        request('DAMAGE', 'PENDING', [{ orderItemId: 'desk', quantity: 1 }]),
      ],
      lines,
    )
    expect(out.size).toBe(0)
  })
})

describe('damagePhotoFolderPath', () => {
  it('files a photograph beside the order it belongs to', () => {
    expect(damagePhotoFolderPath('DW000200')).toEqual(['Orders', 'DW000200', 'issues'])
  })
})
