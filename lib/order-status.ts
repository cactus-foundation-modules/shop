import {
  getOrderById,
  getOrderItems,
  outstandingPreOrderItems,
  releasePreOrderAllocationForOrder,
  updateOrderStatus,
} from '@/modules/shop/lib/db/orders'
import { createShipment, getOrderDispatchSummary } from '@/modules/shop/lib/db/shipments'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { issueInvoiceForOrder, shouldIssueOn, type InvoiceTrigger } from '@/modules/shop/lib/invoices'
import { invoiceEmailAttachment } from '@/modules/shop/lib/invoice-attachment'
import type { ShpEmailTemplateTrigger, ShpOrderItem, ShpOrderStatus } from '@/modules/shop/lib/types'

// Everything that happens when an order's status changes, in one place.
//
// It lives here rather than in the status route because two callers now make
// the same change: the single order screen, and the bulk bar on the orders
// list. A second copy of "what marking an order as dispatched actually means"
// would drift, and the two would then disagree about whether a pre-order is
// holding an order shut, or whether stock has been counted off - the same
// reasoning that keeps outstandingPreOrderItems in lib/db/orders.ts with two
// callers rather than one copy each.

const STATUS_EMAIL_TRIGGER: Partial<Record<ShpOrderStatus, ShpEmailTemplateTrigger>> = {
  PROCESSING: 'STATUS_PROCESSING',
  SHIPPED: 'STATUS_SHIPPED',
  COMPLETED: 'STATUS_COMPLETED',
  CANCELLED: 'STATUS_CANCELLED',
}

function holdAllMessage(outstanding: ShpOrderItem[]): string {
  const count = outstanding.length
  const noun = count === 1 ? '1 item is' : `${count} items are`
  // Latest known date first - that is the one the whole order has to wait for.
  const latest = outstanding
    .map((i) => i.preOrderDispatchDate)
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime())[0]
  const when = latest
    ? `${count === 1 ? 'expected' : 'the last of them expected'} on ${latest.toLocaleDateString('en-GB')}`
    : 'with no expected date yet'
  return (
    `Your shop is set to hold the whole order until every item is in stock, so this one cannot be marked as dispatched yet. ` +
    `${noun} still on pre-order, ${when}. ` +
    `Once the stock has arrived, take those products off pre-order and try again - or change the mixed basket setting to offer split shipping.`
  )
}

export type ApplyOrderStatusResult =
  | { ok: true; changed: boolean }
  | { ok: false; status: number; error: string }

export async function applyOrderStatusChange({ orderId, status, sendEmail }: {
  orderId: string
  status: ShpOrderStatus
  sendEmail?: boolean
}): Promise<ApplyOrderStatusResult> {
  const order = await getOrderById(orderId)
  if (!order) return { ok: false, status: 404, error: 'Order not found' }

  const config = await getShopConfigCached()

  // HOLD_ALL is a dispatch policy, not a checkout restriction - a mixed basket
  // is always purchasable (see the note in the payment-intent route). The policy
  // bites here instead: the whole order goes out in one piece, so it cannot be
  // marked dispatched while any pre-order line is still waiting on stock.
  // PROMPT_SPLIT means the opposite by design, so it never refuses.
  if (status === 'SHIPPED' && config.preOrderMixedCartBehaviour === 'HOLD_ALL') {
    const outstanding = await outstandingPreOrderItems(await getOrderItems(orderId))
    if (outstanding.length > 0) return { ok: false, status: 409, error: holdAllMessage(outstanding) }
  }

  const changed = await updateOrderStatus(orderId, status)

  // Everything below is a once-per-transition side effect, so it hangs off
  // `changed`. Re-sending a status the order already has must be a no-op:
  // SHIPPED -> COMPLETED -> SHIPPED used to decrement the pre-order stock a
  // second time, and decrementStockOnShip clamps at zero rather than erroring,
  // so the shop silently undercounted.
  if (changed) {
    // Pre-order items: stock decrements on ship, not on purchase (addendum B.4).
    //
    // That decrement lives in createShipment, so it happens per parcel rather
    // than all at once. An owner who never touches the dispatch screen and simply
    // flips the order to SHIPPED still has to end up with correct stock, so this
    // records an implicit shipment covering whatever is still outstanding - which
    // routes back through the one decrement path instead of being a second one.
    //
    // Anything already dispatched is excluded by outstandingQty, so a partly
    // dispatched order that is then flipped to SHIPPED decrements only the
    // remainder. If nothing is outstanding there is no parcel to record.
    if (status === 'SHIPPED') {
      const summary = await getOrderDispatchSummary(orderId)
      const remaining = summary.lines
        .filter((l) => l.outstandingQty > 0)
        .map((l) => ({ orderItemId: l.orderItemId, quantity: l.outstandingQty }))
      if (remaining.length > 0) {
        const recorded = await createShipment({
          orderId,
          items: remaining,
          notes: 'Recorded automatically when the order was marked as dispatched.',
        })
        if (!recorded.ok) {
          console.error('[shop] could not record the implicit shipment for order', orderId, recorded.error)
        }
      }
    }

    // Cancelling hands the pre-order allocation back, so the slot can be sold
    // again instead of being held by an order that is never going to happen.
    if (status === 'CANCELLED') {
      await releasePreOrderAllocationForOrder(orderId)
    }

    // Invoicing, when the shop has asked for it on this particular transition.
    // Hangs off `changed` with everything else here, so an order flipped back
    // and forth cannot be invoiced twice - and the unique index behind
    // issueInvoiceForOrder makes that true even if it were called twice anyway.
    //
    // A refusal is logged and nothing more: the status change has happened, the
    // customer has been emailed, and rolling all that back because the paperwork
    // would not raise would be a worse outcome than an invoice raised by hand.
    const invoiceTrigger: InvoiceTrigger | null =
      status === 'SHIPPED' ? 'DISPATCHED' : status === 'COMPLETED' ? 'COMPLETED' : null
    if (invoiceTrigger && shouldIssueOn(config, invoiceTrigger)) {
      const invoiced = await issueInvoiceForOrder(orderId, { trigger: invoiceTrigger, issuedBy: 'AUTO' })
      if (!invoiced.ok) console.error('[shop] could not invoice order', orderId, invoiced.error)
    }
  }

  if (sendEmail) {
    const trigger = STATUS_EMAIL_TRIGGER[status]
    if (trigger) {
      // The invoice travels with the completion email, which is the one message
      // in the order's life a customer files rather than reads. It is looked up
      // after the block above rather than before, so an order invoiced on this
      // very transition sends the invoice it has just been given rather than
      // the nothing it had a moment earlier.
      //
      // COMPLETED only. An invoice on the despatch note would be the same
      // document sent twice for shops that invoice on despatch and complete
      // afterwards, and the shopper reading "your order is on its way" is not
      // filing paperwork yet.
      const invoice = status === 'COMPLETED' ? await invoiceEmailAttachment(orderId, config) : null

      await notifyOrderCustomer(trigger, order, {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        shopName: config.shopTitle || 'Shop',
      }, invoice ? { attachments: [invoice] } : undefined)
    }
  }

  return { ok: true, changed }
}
