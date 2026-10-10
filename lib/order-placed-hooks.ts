// `shop.order-placed-unpaid` - a module gets told, once, that a shopper has
// finished checking out on a method nobody has been paid on yet.
//
// The opposite number to `shop.order-paid` (lib/order-paid-hooks.ts). Every
// automated method announces order-paid seconds after the order is placed, so
// that one point covers them. A manual method - bank transfer, cash, a module's
// own 'manual' provider - can sit unpaid for a week, and the shopper is a real
// person with a real order the whole time: somebody who emailed in before
// ordering should not stay a stranger in the address book until the transfer
// lands. This is the announcement for that week.
//
// Fired from the checkout confirm route's manual branch, which parks the order
// once only (a repeat call finds it no longer PENDING and stops), so it runs
// EXACTLY ONCE per order. The same order announces order-paid as well when the
// money is cleared, so an observer listening to both must be safe to run twice.
//
// OBSERVERS, not contributors - the same rules as order-paid. Nothing returned
// is stored, and one having a bad day cannot cost the shopper their order.
import { gatherCartExtensionPoint } from '@/modules/shop/lib/line-meta'

export type OrderPlacedUnpaidEvent = {
  orderId: string
  orderNumber: string
  /** The stored `payment_method` code, as on order-paid. */
  paymentMethod: string
}

export type OrderPlacedUnpaidObserver = (event: OrderPlacedUnpaidEvent) => Promise<void> | void

const POINT = 'shop.order-placed-unpaid'

/**
 * Tell every registered observer that an order is placed and awaiting payment.
 *
 * Never throws. Never rejects. An observer that throws is logged and the next
 * one still runs.
 */
export async function notifyOrderPlacedUnpaid(event: OrderPlacedUnpaidEvent): Promise<void> {
  try {
    const observers = await gatherCartExtensionPoint<OrderPlacedUnpaidObserver>(POINT)
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
