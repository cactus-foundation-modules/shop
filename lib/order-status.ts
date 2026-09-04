import {
  getOrderById,
  getOrderItems,
  outstandingPreOrderItems,
  releasePreOrderAllocationForOrder,
  updateOrderStatus,
} from '@/modules/shop/lib/db/orders'
import { createShipment, getOrderDispatchSummary, getShipmentsForOrder } from '@/modules/shop/lib/db/shipments'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { issueInvoiceForOrder, shouldIssueOn, type InvoiceTrigger } from '@/modules/shop/lib/invoices'
import { invoiceEmailAttachment } from '@/modules/shop/lib/invoice-attachment'
import { renderOrderItemsEmailTable } from '@/modules/shop/lib/order-items-email'
import { customerReferenceVars } from '@/modules/shop/lib/email'
import { formatMoney } from '@/modules/shop/lib/money'
import { getSiteUrl } from '@/lib/config/env'
import { escapeHtml } from '@/lib/email/blocks'
import { safeTrackingUrl } from '@/modules/shop/lib/tracking-url'
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

function formatAddress(address: { line1: string; line2?: string; city: string; postcode: string; country: string }): string {
  return [address.line1, address.line2, address.city, address.postcode, address.country].filter(Boolean).join(', ')
}

export type DispatchDetails = {
  trackingNumber: string
  carrier: string
  /** The one tracking link, where there is exactly one. */
  trackingUrl: string
  /** Every tracking link as ready-made markup, one per parcel. */
  trackingLinks: string
}

/**
 * The carrier, tracking numbers and tracking links to quote in a dispatch
 * email.
 *
 * An order can have gone out in several parcels, and the customer being told
 * the whole order is dispatched wants every number, not the first one recorded
 * - so the distinct values are joined. Parcels with nothing recorded against
 * them simply contribute nothing; an order dispatched by hand with nothing at
 * all comes back with empty strings, and the template's `{{#if}}` drops the
 * line rather than printing "Tracking number:" followed by a blank.
 *
 * Links are the awkward one, because a single `{{trackingUrl}}` in somebody's
 * own wording is one anchor and three parcels are three. So both are offered:
 * `trackingUrl` is filled in ONLY when there is exactly one link, which is the
 * ordinary case and the only case where a lone anchor cannot point at the wrong
 * parcel, and `trackingLinks` is a block covering however many there are. The
 * default wording uses the block.
 */
export function dispatchDetails(
  shipments: Array<{ trackingNumber: string | null; trackingUrl?: string | null; carrier: string | null }>,
): DispatchDetails {
  const unique = (values: Array<string | null>): string[] =>
    [...new Set(values.map((v) => v?.trim() ?? '').filter(Boolean))]

  // Kept as pairs so a parcel's link can be labelled with its own number - two
  // bare "Track your parcel" links one under the other are no use to anybody.
  const parcels: Array<{ url: string; label: string }> = []
  for (const shipment of shipments) {
    const url = safeTrackingUrl(shipment.trackingUrl ?? null)
    if (!url || parcels.some((p) => p.url === url)) continue
    const number = shipment.trackingNumber?.trim() ?? ''
    parcels.push({ url, label: number ? `Track ${number}` : 'Track your parcel' })
  }

  // Escaped here because the value goes into the body unescaped - it is markup
  // this module assembled, and a tracking number is typed by a person.
  const trackingLinks = parcels.length === 0
    ? ''
    : parcels
        .map((p) => `<p style="margin:0 0 8px;"><a href="${escapeHtml(p.url)}">${escapeHtml(p.label)}</a></p>`)
        .join('')

  return {
    trackingNumber: unique(shipments.map((s) => s.trackingNumber)).join(', '),
    carrier: unique(shipments.map((s) => s.carrier)).join(', '),
    trackingUrl: parcels.length === 1 ? (parcels[0]?.url ?? '') : '',
    trackingLinks,
  }
}

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
        // No courier details: they belong to a parcel somebody actually
        // packed, and this shipment is an accounting entry for whatever was
        // left. An owner with a tracking number to quote records the parcel on
        // the dispatch screen instead, and the email reads them back off there.
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

      // The parcels' own numbers, read back off the order rather than taken
      // from the argument, so the email quotes everything that has gone out
      // and not merely whatever was typed into this one change. Only gathered
      // on a dispatch: no other status has anything to say about parcels.
      const dispatch: DispatchDetails = status === 'SHIPPED'
        ? dispatchDetails(await getShipmentsForOrder(orderId).catch(() => []))
        : { trackingNumber: '', carrier: '', trackingUrl: '', trackingLinks: '' }

      // A status email used to carry three values - the customer's name, the
      // order number and the shop's. Any owner who put the order's contents,
      // its total or the delivery address into their own wording got a blank
      // where each one should have been, because an unknown merge tag collapses
      // to nothing rather than complaining. They are all filled in now, so a
      // dispatch notice can say what is in the parcel and where it is going.
      const items = await getOrderItems(orderId)

      await notifyOrderCustomer(trigger, order, {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        orderTotal: formatMoney(order.total, config.currencySymbol),
        orderItems: await renderOrderItemsEmailTable(items, config),
        shippingAddress: formatAddress(order.shippingAddress),
        trackingNumber: dispatch.trackingNumber,
        carrier: dispatch.carrier,
        trackingUrl: dispatch.trackingUrl,
        trackingLinks: dispatch.trackingLinks,
        hasTracking: dispatch.trackingNumber ? 'true' : 'false',
        hasCarrier: dispatch.carrier ? 'true' : 'false',
        hasTrackingUrl: dispatch.trackingUrl ? 'true' : 'false',
        hasTrackingLinks: dispatch.trackingLinks ? 'true' : 'false',
        ...customerReferenceVars(order, config),
        shopName: config.shopTitle || 'Shop',
        shopUrl: `${getSiteUrl()}/shop`,
      }, invoice ? { attachments: [invoice] } : undefined)
    }
  }

  return { ok: true, changed }
}
