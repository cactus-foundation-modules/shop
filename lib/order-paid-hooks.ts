// `shop.order-paid` - a module gets told, once, that an order has been paid for.
//
// The reason this seam exists: several things a site wants to happen when money
// lands are not shop's business at all. Buying the goods in from a supplier is
// the first of them. Shop knows when the money arrived and nothing else knows;
// the module that acts on it knows about purchasing and shop knows nothing about
// that. So shop announces, generically, and whoever is listening listens.
//
// OBSERVERS, not contributors. Nothing an observer returns is stored, nothing it
// does is waited on for correctness, and one having a bad day cannot cost the
// shopper their order or fail a payment webhook - by the time this runs the money
// is in, the stock is down and the customer has been emailed. The rule is the one
// `lib/order-payment-state.ts` already follows for its own providers, and the one
// the invoice trigger in `lib/order-fulfillment.ts` follows for itself.
//
// Fired from `fulfillPaidOrder`, which is gated on `markOrderPaid()` returning
// true, so it runs EXACTLY ONCE per order however the money arrived - card,
// PayPal, Square, GoCardless, bank transfer cleared by hand, or a zero-total
// order that never touched a provider. One announcement covers all of them.
import { gatherCartExtensionPoint } from '@/modules/shop/lib/line-meta'

export type OrderPaidEvent = {
  orderId: string
  orderNumber: string
  /** The stored `payment_method` code. A provider label is a display concern and
   *  is deliberately not resolved here. */
  paymentMethod: string
  /**
   * True where the owner cleared the payment by hand rather than a provider
   * settling it.
   *
   * Worth carrying: a bank transfer cleared four days after the order was placed
   * is a different situation from a card authorised thirty seconds ago, and an
   * observer may reasonably behave differently. Read off the payment provider's
   * `confirmMode`, so a module's own manual method counts as manual too.
   */
  clearedManually: boolean
}

export type OrderPaidObserver = (event: OrderPaidEvent) => Promise<void> | void

const POINT = 'shop.order-paid'

/**
 * Tell every registered observer that an order has been paid for.
 *
 * Never throws. Never rejects. An observer that throws is logged and the next
 * one still runs, because "the purchasing module is broken" must not read to
 * the shopper as "your payment failed".
 *
 * On a site with no observers this is a single memoised read of the installed
 * manifests and no work at all, which is every shop that has not asked for any
 * of this.
 */
export async function notifyOrderPaid(event: OrderPaidEvent): Promise<void> {
  const observers = await gatherCartExtensionPoint<OrderPaidObserver>(POINT)
  if (observers.length === 0) return

  for (const observe of observers) {
    try {
      await observe(event)
    } catch (err) {
      console.error(`[shop.order-paid] observer failed for order ${event.orderNumber}`, err)
    }
  }
}
