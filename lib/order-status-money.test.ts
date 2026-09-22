import { describe, expect, it } from 'vitest'
import {
  CANCEL_PAID_ORDER_MESSAGE,
  REFUND_BY_HAND_MESSAGE,
  statusChangeRefusal,
} from '@/modules/shop/lib/order-status-money'
import type { ShpOrder, ShpOrderItem } from '@/modules/shop/lib/types'

// The statuses an owner cannot pick off the menu while the money says otherwise.
// Every refusal here stops a status saying something about money that did not
// happen: an order cancelled with the customer's payment kept, or called
// refunded with nothing sent back.

type Order = Pick<ShpOrder, 'kind' | 'status' | 'paymentStatus' | 'total'>
type Line = Pick<ShpOrderItem, 'quantity' | 'refundedQty'>

const paid: Order = { kind: 'SALE', status: 'PROCESSING', paymentStatus: 'PAID', total: '120.00' }
const lines: Line[] = [{ quantity: 2, refundedQty: 0 }, { quantity: 1, refundedQty: 0 }]

describe('statusChangeRefusal - cancelling', () => {
  it('refuses to cancel an order the customer has paid for', () => {
    expect(statusChangeRefusal(paid, lines, 'CANCELLED')).toBe(CANCEL_PAID_ORDER_MESSAGE)
  })

  it('refuses while part of the money is still held', () => {
    const part: Line[] = [{ quantity: 2, refundedQty: 2 }, { quantity: 1, refundedQty: 0 }]
    expect(statusChangeRefusal({ ...paid, paymentStatus: 'PARTIALLY_REFUNDED' }, part, 'CANCELLED')).toBe(CANCEL_PAID_ORDER_MESSAGE)
  })

  it.each(['PENDING', 'AWAITING_CONFIRMATION', 'FAILED'] as const)('lets an order go that is %s', (paymentStatus) => {
    expect(statusChangeRefusal({ ...paid, paymentStatus }, lines, 'CANCELLED')).toBeNull()
  })

  it('lets a fully refunded order be cancelled', () => {
    const all: Line[] = [{ quantity: 2, refundedQty: 2 }, { quantity: 1, refundedQty: 1 }]
    expect(statusChangeRefusal(paid, all, 'CANCELLED')).toBeNull()
  })

  // Refunded in the payment provider's own dashboard: the lifecycle moved, the
  // lines did not.
  it('believes a lifecycle that already says refunded', () => {
    expect(statusChangeRefusal({ ...paid, status: 'REFUNDED' }, lines, 'CANCELLED')).toBeNull()
  })

  // Part refunded in the provider's dashboard: the payment says so, no line does,
  // and the Refund button cannot finish it off. Cancelling must stay possible.
  it('believes a part refund made outside the shop', () => {
    expect(statusChangeRefusal({ ...paid, status: 'PARTIALLY_REFUNDED', paymentStatus: 'PARTIALLY_REFUNDED' }, lines, 'CANCELLED')).toBeNull()
  })

  it('lets a free order be cancelled - there is no money to send back', () => {
    expect(statusChangeRefusal({ ...paid, total: '0.00' }, lines, 'CANCELLED')).toBeNull()
  })

  it('leaves replacements alone - their "paid" is a label, not a payment', () => {
    expect(statusChangeRefusal({ ...paid, kind: 'REPLACEMENT' }, lines, 'CANCELLED')).toBeNull()
  })
})

describe('statusChangeRefusal - refunded by hand', () => {
  it('refuses Refunded when nothing has been refunded', () => {
    expect(statusChangeRefusal(paid, lines, 'REFUNDED')).toBe(REFUND_BY_HAND_MESSAGE)
  })

  it('refuses Part refunded when nothing has been refunded', () => {
    expect(statusChangeRefusal(paid, lines, 'PARTIALLY_REFUNDED')).toBe(REFUND_BY_HAND_MESSAGE)
  })

  it('refuses either on an order nobody has paid for', () => {
    const unpaid = { ...paid, paymentStatus: 'PENDING' as const }
    expect(statusChangeRefusal(unpaid, lines, 'REFUNDED')).toBe(REFUND_BY_HAND_MESSAGE)
    expect(statusChangeRefusal(unpaid, lines, 'PARTIALLY_REFUNDED')).toBe(REFUND_BY_HAND_MESSAGE)
  })

  // Setting the status back to match the refunds on record is fine - an order
  // completed after a part refund, say.
  it('allows Part refunded once a refund is on record', () => {
    const part: Line[] = [{ quantity: 2, refundedQty: 1 }, { quantity: 1, refundedQty: 0 }]
    expect(statusChangeRefusal({ ...paid, status: 'COMPLETED' }, part, 'PARTIALLY_REFUNDED')).toBeNull()
    expect(statusChangeRefusal({ ...paid, paymentStatus: 'PARTIALLY_REFUNDED' }, lines, 'PARTIALLY_REFUNDED')).toBeNull()
  })

  it('allows Refunded once everything is refunded', () => {
    const all: Line[] = [{ quantity: 2, refundedQty: 2 }, { quantity: 1, refundedQty: 1 }]
    expect(statusChangeRefusal(paid, all, 'REFUNDED')).toBeNull()
    expect(statusChangeRefusal({ ...paid, paymentStatus: 'REFUNDED' }, lines, 'REFUNDED')).toBeNull()
  })
})

describe('statusChangeRefusal - everything else', () => {
  it.each(['PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'ON_HOLD'] as const)('never stands in the way of %s', (status) => {
    expect(statusChangeRefusal(paid, lines, status)).toBeNull()
  })
})
