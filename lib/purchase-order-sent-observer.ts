import { getOrderById } from '@/modules/shop/lib/db/orders'
import { applyOrderStatusChange } from '@/modules/shop/lib/order-status'

// A purchase order raised for one of this shop's orders has gone to the
// supplier, so the goods are being got in: the order moves from PROCESSING to
// PREPARING and the customer is told.
//
// Registered against `purchase-orders.sent`. Shop stays generic: it knows that
// a module announced something was sent against its order, not that purchasing
// exists, and the payload is restated here as plain values so nothing imports
// the announcer. On a site without the announcer this is never called.
//
// Only a PROCESSING order moves. PENDING has not been paid for, ON_HOLD was put
// there on purpose, and anything further along (PREPARING already, dispatched,
// completed, cancelled, refunded) says more than a purchase order does. An order
// with several purchase orders moves on the first and is a no-op after, so the
// customer hears once.

export type PurchaseOrderSentEvent = {
  purchaseOrderNumber: string
  /** Who the order was raised for. Null for one raised by hand or by a reorder. */
  source: { module: 'shop'; orderId: string } | null
}

export type PurchaseOrderSentResult = 'moved' | 'ignored'

export async function observePurchaseOrderSent(event: PurchaseOrderSentEvent): Promise<PurchaseOrderSentResult> {
  if (!event.source || event.source.module !== 'shop') return 'ignored'

  const order = await getOrderById(event.source.orderId)
  if (!order || order.status !== 'PROCESSING') return 'ignored'

  const result = await applyOrderStatusChange({
    orderId: order.id,
    status: 'PREPARING',
    sendEmail: true,
    emailOnlyIfChanged: true,
  })
  // A refusal is permanent and not worth retrying; the order stays PROCESSING
  // and the dropdown is still there.
  if (!result.ok) {
    console.warn(`[shop] purchase order ${event.purchaseOrderNumber} could not move order ${order.id} to PREPARING: ${result.error}`)
    return 'ignored'
  }
  return result.changed ? 'moved' : 'ignored'
}

/** What the manifest entry names. */
export const shopPurchaseOrderSentObserver = (event: PurchaseOrderSentEvent): Promise<PurchaseOrderSentResult> =>
  observePurchaseOrderSent(event)
