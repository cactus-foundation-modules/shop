import { getShopConfigCached } from '@/modules/shop/lib/config'
import { claimSlotNotification, getOrderDispatchSummary, getShipmentsForOrder } from '@/modules/shop/lib/db/shipments'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { orderTrackingUrl } from '@/modules/shop/lib/order-tracking'
import { renderOrderItemsTable, type OrderEmailLine } from '@/modules/shop/lib/order-items-email'
import { orderItemEmailMedia } from '@/modules/shop/lib/order-item-email-media'
import {
  deliveryBookingForShipment,
  formatDeliveryDay,
  formatDeliveryWindow,
} from '@/modules/shop/lib/delivery-slot'
import { courierFaqUrl, faqsForShipment } from '@/modules/shop/lib/courier-faqs'
import type { ShpShipment } from '@/modules/shop/lib/types'

// "Your delivery is confirmed for Tuesday, between 10:00 and 13:00."
//
// The second of the two emails a delivery gets, and the one people actually
// act on: the dispatch note says a parcel exists, this one says which morning
// to be in. It is sent when the window is written onto a parcel that already
// went out, which on a two-stage courier is a day or two later.
//
// Sent at most once per parcel. The route claims the right to send it in the
// same statement that records it (claimSlotNotification), so correcting a typo
// on the parcel afterwards does not send it again.
//
// Silent no-op when anything it needs has gone: the parcel, the order, or the
// window itself. An email is not worth failing an edit that already committed.

function hasCompleteBookedSlot(shipment: Pick<ShpShipment, 'deliveryDate' | 'deliverySlotStart' | 'deliverySlotEnd'>): boolean {
  return Boolean(shipment.deliveryDate && shipment.deliverySlotStart && shipment.deliverySlotEnd)
}

function deliveryEmailParts(
  shipment: Pick<ShpShipment, 'deliveryDate' | 'deliverySlotStart' | 'deliverySlotEnd' | 'deliveryWindowFrom' | 'deliveryWindowTo'>,
  timezone: string,
): { day: string; window: string; slotStart: string; slotEnd: string } | null {
  const booking = deliveryBookingForShipment(shipment, timezone)
  const day = formatDeliveryDay(booking.date)
  const window = formatDeliveryWindow(booking.slotStart, booking.slotEnd)
  if (!day || !window || !booking.slotStart || !booking.slotEnd) return null
  return { day, window, slotStart: booking.slotStart, slotEnd: booking.slotEnd }
}

export async function sendDeliverySlotEmail(params: {
  orderId: string
  shipmentId: string
  timezone: string
}): Promise<void> {
  const order = await getOrderById(params.orderId)
  if (!order) return

  const shipment = (await getShipmentsForOrder(params.orderId)).find((s) => s.id === params.shipmentId)
  if (!shipment) return

  const parts = deliveryEmailParts(shipment, params.timezone)
  if (!parts) return

  const config = await getShopConfigCached()

  // What is in THIS parcel, so somebody with a split order knows which half is
  // arriving. Names come off the dispatch summary the order screen reads, so
  // the email cannot disagree with it; pictures and links the same way the
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

  const orderUrl = orderTrackingUrl(order.orderNumber, config)
  const faqs = faqsForShipment(config, shipment)
  const faqUrl = faqs.length > 0 ? courierFaqUrl(orderUrl) : ''
  const carrier = shipment.carrier?.trim() ?? ''

  await notifyOrderCustomer('DELIVERY_SLOT_CONFIRMED', order, {
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    deliveryDay: parts.day,
    deliveryWindow: parts.window,
    deliverySlotStart: parts.slotStart,
    deliverySlotEnd: parts.slotEnd,
    parcelItems: lines.length > 0 ? renderOrderItemsTable(lines) : '',
    hasParcelItems: lines.length > 0 ? 'true' : 'false',
    carrier,
    hasCarrier: carrier ? 'true' : 'false',
    faqUrl,
    hasFaq: faqUrl ? 'true' : 'false',
    shopName: config.shopTitle || 'Shop',
  })
}

/** Tell the customer their delivery window, when the courier's own tracking
 *  reports one and nobody has been emailed yet. Uses the same message and the
 *  same once-only stamp as an owner typing the window in by hand. */
export async function maybeSendCarrierWindowEmail(
  parcel: Pick<
    ShpShipment,
    | 'id'
    | 'orderId'
    | 'deliveryDate'
    | 'deliverySlotStart'
    | 'deliverySlotEnd'
    | 'deliveryWindowFrom'
    | 'deliveryWindowTo'
    | 'slotNotifiedAt'
  >,
  reading: { windowFrom: Date | null; windowTo: Date | null },
  timezone: string,
): Promise<boolean> {
  if (parcel.slotNotifiedAt) return false
  if (hasCompleteBookedSlot(parcel)) return false
  if (!reading.windowFrom || !reading.windowTo) return false
  if (!(await claimSlotNotification(parcel.id, parcel.orderId))) return false

  try {
    await sendDeliverySlotEmail({ orderId: parcel.orderId, shipmentId: parcel.id, timezone })
  } catch (error) {
    console.error('[shop] carrier window email failed', error)
  }
  return true
}
