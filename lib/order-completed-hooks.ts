// `shop.order-completed` - a module gets told, once, that an order has been
// marked Completed.
//
// The reason this seam exists is the same as `shop.order-paid`'s, pointing the
// other way down the order's life: the customer has their goods, and several
// things a site wants to happen then are not shop's business. Purchasing closing
// off the supplier's side of it is the first. Shop knows when the order finished
// and nothing else does; the module that acts on it knows about invoices and
// shop knows nothing about those. So shop announces, generically, and whoever is
// listening listens.
//
// OBSERVERS, not contributors. Nothing an observer returns is stored and one
// having a bad day cannot undo the status change - by the time this runs the
// order is Completed, the invoice has been raised and the customer emailed.
//
// Fired from `applyOrderStatusChange` on the transition into COMPLETED only, and
// only where the status actually changed, so re-sending Completed to an order
// that already is announces nothing. An order that goes Completed, back to
// Shipped and Completed again is announced twice, so an observer must be safe to
// run twice. A hook is not a guarantee: a module installed after the order
// completed, or a shop older than the point, never hears about it.
import { gatherCartExtensionPoint } from '@/modules/shop/lib/line-meta'

export type OrderCompletedEvent = {
  orderId: string
  orderNumber: string
}

export type OrderCompletedObserver = (event: OrderCompletedEvent) => Promise<void> | void

const POINT = 'shop.order-completed'

/**
 * Tell every registered observer that an order has been completed.
 *
 * Never throws. Never rejects. An observer that throws is logged and the next
 * one still runs, because "the purchasing module is broken" must not read to the
 * person completing the order as "that did not save".
 */
export async function notifyOrderCompleted(event: OrderCompletedEvent): Promise<void> {
  try {
    const observers = await gatherCartExtensionPoint<OrderCompletedObserver>(POINT)
    for (const observe of observers) {
      try {
        await observe(event)
      } catch (err) {
        console.error(`[${POINT}] observer failed for order ${event.orderNumber}`, err)
      }
    }
  } catch (err) {
    console.error(`[${POINT}] observers could not be gathered for order ${event.orderNumber}`, err)
  }
}
