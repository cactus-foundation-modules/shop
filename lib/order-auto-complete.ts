import { getOrderById } from '@/modules/shop/lib/db/orders'
import { allShipmentsDelivered, getOrderDispatchSummary } from '@/modules/shop/lib/db/shipments'
import { applyOrderStatusChange } from '@/modules/shop/lib/order-status'
import type { ShpOrderStatus } from '@/modules/shop/lib/types'

// Finishing an order off once the courier says the last of it has arrived.
//
// One function, because two things learn that a parcel has been delivered: the
// hourly tracking job, and the customer's own order page, which asks the courier
// while somebody is watching a parcel that is out for delivery. The page poll
// used to record the delivery and stop there, and a delivered parcel drops out
// of the hourly queue - so an order delivered while its customer had the page
// open sat on Dispatched until the job's leftovers sweep came round to it.

/** An order in one of these is left alone however many parcels have landed.
 *  Completed is done already; a delivered parcel on a cancelled or refunded
 *  order is a conversation, not a completion. */
const NOT_COMPLETABLE: ReadonlySet<ShpOrderStatus> = new Set(['COMPLETED', 'CANCELLED', 'REFUNDED'])

/**
 * Mark the order COMPLETED when every parcel on it has arrived AND nothing is
 * left owing. Both halves matter: an order with one of three parcels delivered
 * is not complete, and neither is one whose only parcel arrived while two items
 * still sit in the warehouse waiting for stock.
 *
 * Goes through applyOrderStatusChange rather than writing the status, so the
 * completion email, invoicing and everything else that hangs off a status
 * change behave exactly as when an owner presses the button. The email only
 * goes when this call is the one that moved the order, so the job and a
 * watching customer arriving at the same moment send one message, not two.
 *
 * True when the order was completed by this call.
 */
export async function completeOrderIfEveryParcelArrived(orderId: string): Promise<boolean> {
  const order = await getOrderById(orderId)
  if (!order || NOT_COMPLETABLE.has(order.status)) return false

  const [summary, everyParcelIn] = await Promise.all([
    getOrderDispatchSummary(orderId),
    allShipmentsDelivered(orderId),
  ])
  if (!everyParcelIn || !summary.fullyDispatched) return false

  const result = await applyOrderStatusChange({
    orderId,
    status: 'COMPLETED',
    sendEmail: true,
    emailOnlyIfChanged: true,
  })
  if (!result.ok) {
    console.warn(`[shop] could not complete delivered order ${orderId}: ${result.error}`)
    return false
  }
  return result.changed
}
