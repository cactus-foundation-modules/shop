import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { getOrderDispatchSummary, getShipmentsForOrder } from '@/modules/shop/lib/db/shipments'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { renderOrderItemsTable, type OrderEmailLine } from '@/modules/shop/lib/order-items-email'
import { orderItemEmailMedia } from '@/modules/shop/lib/order-item-email-media'
import { parentOrderVars } from '@/modules/shop/lib/replacement-emails'
import { safeTrackingUrl } from '@/modules/shop/lib/tracking-url'
import type { ShpShipmentWithItems } from '@/modules/shop/lib/types'

// "Here is the tracking for the parcel we told you about."
//
// A parcel is routinely dispatched before its tracking exists: the courier
// collects in the morning and issues the number that afternoon, and a pallet
// network issues one only once the consignment is on a trunk. The dispatch note
// has already gone by then, saying the goods have left and carrying no way of
// following them.
//
// Until now typing the number in afterwards told the customer nothing at all.
// This is the follow-up, and it is the twin of the delivery-window email: the
// second message a parcel gets, sent because it carries something the first one
// could not.
//
// Sent at most once per parcel. The route claims the right to send it in the
// same statement that records it (claimTrackingNotification), so correcting a
// typo afterwards does not send it a second time.

/** Whether this parcel now has something a customer could actually follow.
 *
 *  A courier name on its own is not tracking - it is who has the box. What
 *  makes this email worth sending is a number, a link or a short code, so that
 *  is what the test is. */
export function hasFollowableTracking(shipment: {
  trackingNumber: string | null
  trackingUrl: string | null
  trackingShortCode: string | null
}): boolean {
  return Boolean(
    shipment.trackingNumber?.trim()
    || shipment.trackingUrl?.trim()
    || shipment.trackingShortCode?.trim(),
  )
}

/**
 * Silent no-op when anything it needs has gone - the parcel, the order, the
 * tracking itself. An email is not worth failing an edit that already
 * committed, and the tracking is on the customer's order page either way.
 */
export async function sendTrackingAddedEmail(params: { orderId: string; shipmentId: string }): Promise<void> {
  const order = await getOrderById(params.orderId)
  if (!order) return

  const shipment = (await getShipmentsForOrder(params.orderId)).find((s) => s.id === params.shipmentId)
  if (!shipment || !hasFollowableTracking(shipment)) return

  const config = await getShopConfigCached()

  // What is in THIS parcel, so somebody with a split order knows which half the
  // number belongs to. Off the dispatch summary the order screen reads, so the
  // email cannot disagree with it; pictures and links the same way the
  // dispatch note has them, so the two read as one order.
  const [summary, media] = await Promise.all([
    getOrderDispatchSummary(params.orderId),
    orderItemEmailMedia(params.orderId, config),
  ])
  const nameByOrderItemId = new Map(summary.lines.map((l) => [l.orderItemId, l.productName]))
  const lines: OrderEmailLine[] = shipment.items
    .map((item) => ({
      name: nameByOrderItemId.get(item.orderItemId) ?? 'Item',
      quantity: item.quantity,
      imageUrl: media.imageFor(item.orderItemId),
      url: media.linkFor(item.orderItemId),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const carrier = shipment.carrier?.trim() ?? ''
  const trackingNumber = shipment.trackingNumber?.trim() ?? ''
  // Through the same guard every other surface uses: an owner-typed URL is not
  // something to put in front of a customer unchecked.
  const trackingUrl = safeTrackingUrl(shipment.trackingUrl) ?? ''

  await notifyOrderCustomer(
    // A replacement says it differently, as it does everywhere else: the
    // customer did not place this order and the number they recognise is the
    // original's.
    order.kind === 'REPLACEMENT' ? 'REPLACEMENT_TRACKING_ADDED' : 'TRACKING_ADDED',
    order,
    {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      orderItems: renderOrderItemsTable(lines),
      carrier,
      trackingNumber,
      trackingUrl,
      hasCarrier: carrier ? 'true' : 'false',
      hasTrackingNumber: trackingNumber ? 'true' : 'false',
      hasTrackingUrl: trackingUrl ? 'true' : 'false',
      shopName: config.shopTitle || 'Shop',
      ...await parentOrderVars(order),
    },
  )
}

/** Re-exported for the route, which needs the shape before and after the save. */
export type TrackingShape = Pick<ShpShipmentWithItems, 'trackingNumber' | 'trackingUrl' | 'trackingShortCode'>
