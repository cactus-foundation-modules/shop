import { paymentHeld, paymentTaken } from '@/modules/shop/lib/payment-taken'
import type { ShpOrder, ShpOrderItem, ShpOrderStatus } from '@/modules/shop/lib/types'

// The statuses an owner cannot pick by hand while the money says otherwise.
//
// A status is a label. Choosing "Cancelled" off the menu on an order the
// customer has paid for used to cancel it, email them that it was cancelled and
// keep their money - nothing on that path goes near a payment provider, and
// nothing recorded that anything was owed back. "Refunded" and "Part refunded"
// were worse: they said money had gone back when none had, with no refund row,
// no credit note and the payment still showing as paid. Money moves on the
// Refund button, which returns it, records it and sets these statuses itself.
//
// Only the owner's own menu (the single order screen and the bulk bar) is held
// to this. The other callers change status for reasons of their own and must not
// be stopped: an approved cancellation request closes the order even when its
// refund has to be retried, and a refund sets the refunded statuses directly.

export const CANCEL_PAID_ORDER_MESSAGE =
  'This order has been paid for, and cancelling it here would not send the money back. ' +
  'Use Refund on this order to return the payment - once everything has been refunded it is marked as refunded for you.'

export const REFUND_BY_HAND_MESSAGE =
  'Marking an order as refunded does not send any money back. ' +
  'Use Refund on this order instead - it returns the payment, records it and sets the status to match.'

type MoneyOrder = Pick<ShpOrder, 'kind' | 'status' | 'paymentStatus' | 'total'>
type MoneyLine = Pick<ShpOrderItem, 'quantity' | 'refundedQty'>

/** Customer money the shop is still holding against goods not yet refunded. */
function moneyStillHeld(order: MoneyOrder, items: MoneyLine[]): boolean {
  // A replacement is left out: its "paid" is a label on a part raised from an
  // earlier order, not a payment this order took (see lib/replacements.ts), so
  // there is nothing on it for a refund to send back.
  if (order.kind !== 'SALE') return false
  if (!(Number(order.total) > 0)) return false
  if (!paymentHeld(order.paymentStatus)) return false
  // A refund the payment provider told us about moves the lifecycle without
  // touching the lines, so a lifecycle that already says refunded is believed.
  if (order.status === 'REFUNDED') return false
  // So is a part refund made in the provider's own dashboard: the payment says
  // part refunded while no line does, because the provider never says which
  // lines it was for. The Refund button cannot finish that off - its caps only
  // know refunds made here - so refusing the cancel as well left an order that
  // could be neither refunded nor cancelled. The owner is settling it outside
  // the shop, and is believed.
  if (order.paymentStatus === 'PARTIALLY_REFUNDED' && items.every((item) => item.refundedQty === 0)) return false
  return items.some((item) => item.refundedQty < item.quantity)
}

function everythingRefunded(order: MoneyOrder, items: MoneyLine[]): boolean {
  if (!paymentTaken(order.paymentStatus)) return false
  if (order.paymentStatus === 'REFUNDED') return true
  return items.length > 0 && items.every((item) => item.refundedQty >= item.quantity)
}

function somethingRefunded(order: MoneyOrder, items: MoneyLine[]): boolean {
  if (!paymentTaken(order.paymentStatus)) return false
  if (order.paymentStatus !== 'PAID') return true
  return items.some((item) => item.refundedQty > 0)
}

/** Why the owner cannot set this status on this order by hand, in words for
 *  them - or null when nothing about the money stands in the way. */
export function statusChangeRefusal(order: MoneyOrder, items: MoneyLine[], status: ShpOrderStatus): string | null {
  if (status === 'CANCELLED') return moneyStillHeld(order, items) ? CANCEL_PAID_ORDER_MESSAGE : null
  if (status === 'REFUNDED') return everythingRefunded(order, items) ? null : REFUND_BY_HAND_MESSAGE
  if (status === 'PARTIALLY_REFUNDED') return somethingRefunded(order, items) ? null : REFUND_BY_HAND_MESSAGE
  return null
}
