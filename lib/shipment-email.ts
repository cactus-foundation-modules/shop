import { getSiteUrl } from '@/lib/config/env'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { getOrderDispatchSummary, getShipmentsForOrder } from '@/modules/shop/lib/db/shipments'
import { sendShopEmail } from '@/modules/shop/lib/email'

// Item lists go into the template as ONE plain-text variable, because
// lib/email.ts HTML-escapes every {{variable}} on the way into the body - any
// <br> or <li> built here would reach the customer as visible angle brackets.
// So each entry is prefixed and newline-joined: the newlines give a proper list
// in the text part, and the "- " prefix keeps the entries apart in the HTML
// part, where the newlines collapse to spaces. Same trade-off ORDER_CONFIRMED
// already makes in lib/order-fulfillment.ts.
function formatItemList(entries: Array<{ productName: string; quantity: number }>): string {
  return entries.map((e) => `- ${e.productName} x${e.quantity}`).join('\n')
}

// Tells the customer that ONE shipment has gone out, listing what was in it and
// what is still owed. Deliberately not STATUS_SHIPPED: that template says the
// whole order is on its way, which is untrue of a part-dispatch.
//
// It covers the final shipment too. When this parcel clears the last
// outstanding unit the PARTIAL_SHIPPED copy switches to "the last part of your
// order", so the dispatch route can call this for EVERY shipment it records and
// never has to decide between two templates. STATUS_SHIPPED stays where it is,
// for an admin flipping the whole order to SHIPPED without recording lines.
//
// Silent no-op when the order or shipment cannot be found, or when the shipment
// has no lines: an email is not worth failing a dispatch that already committed.
export async function sendShipmentDispatchedEmail(params: { orderId: string; shipmentId: string }): Promise<void> {
  const order = await getOrderById(params.orderId)
  if (!order) return

  const shipments = await getShipmentsForOrder(params.orderId)
  const shipment = shipments.find((s) => s.id === params.shipmentId)
  if (!shipment || shipment.items.length === 0) return

  // The summary is the same read the order screen uses, so the figures in the
  // email cannot disagree with the ones the shop owner is looking at. Its lines
  // already carry outstandingQty = quantity - refundedQty - dispatchedQty
  // (dispatched across ALL shipments, floored at zero) and the product names.
  const summary = await getOrderDispatchSummary(params.orderId)
  const lineByOrderItemId = new Map(summary.lines.map((l) => [l.orderItemId, l]))

  const dispatched = shipment.items
    .map((item) => {
      const line = lineByOrderItemId.get(item.orderItemId)
      return line ? { productName: line.productName, quantity: item.quantity } : null
    })
    .filter((entry): entry is { productName: string; quantity: number } => entry !== null)
    .sort((a, b) => a.productName.localeCompare(b.productName))
  if (dispatched.length === 0) return

  const outstanding = summary.lines.filter((l) => l.outstandingQty > 0)

  // Read off the list the customer is about to be shown rather than off
  // summary.fullyDispatched, so the wording can never contradict the "still to
  // come" section printed underneath it.
  const isFinalPart = outstanding.length === 0

  const config = await getShopConfigCached()
  const siteUrl = getSiteUrl()
  const trackingNumber = shipment.trackingNumber?.trim() ?? ''
  const carrier = shipment.carrier?.trim() ?? ''

  await sendShopEmail('PARTIAL_SHIPPED', order.customerEmail, {
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    dispatchedItems: formatItemList(dispatched),
    outstandingItems: formatItemList(
      outstanding.map((l) => ({ productName: l.productName, quantity: l.outstandingQty }))
    ),
    hasOutstanding: isFinalPart ? 'false' : 'true',
    isFinalPart: isFinalPart ? 'true' : 'false',
    hasTracking: trackingNumber ? 'true' : 'false',
    hasCarrier: carrier ? 'true' : 'false',
    trackingNumber,
    carrier,
    shopName: config.shopTitle || 'Shop',
    shopUrl: `${siteUrl}/shop`,
  }, { orderId: order.id })
}
