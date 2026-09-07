import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { getOrderDispatchSummary, getShipmentsForOrder } from '@/modules/shop/lib/db/shipments'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { orderTrackingUrl } from '@/modules/shop/lib/order-tracking'
import { renderOrderItemsTable, type OrderEmailLine } from '@/modules/shop/lib/order-items-email'
import { formatDeliveryDay, formatDeliveryWindow } from '@/modules/shop/lib/delivery-slot'
import { courierFaqUrl, faqsForShipment } from '@/modules/shop/lib/courier-faqs'

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
export async function sendDeliverySlotEmail(params: { orderId: string; shipmentId: string }): Promise<void> {
  const order = await getOrderById(params.orderId)
  if (!order) return

  const shipment = (await getShipmentsForOrder(params.orderId)).find((s) => s.id === params.shipmentId)
  if (!shipment) return

  const day = formatDeliveryDay(shipment.deliveryDate ?? '')
  const window = formatDeliveryWindow(shipment.deliverySlotStart, shipment.deliverySlotEnd)
  if (!day || !window) return

  const config = await getShopConfigCached()

  // What is in THIS parcel, by name, so somebody with a split order knows which
  // half is arriving. Names come off the dispatch summary the order screen
  // reads, so the email cannot disagree with it. No photographs: this email is
  // read on a phone, in a hurry, to find out a time.
  const summary = await getOrderDispatchSummary(params.orderId)
  const nameByOrderItemId = new Map(summary.lines.map((l) => [l.orderItemId, l.productName]))
  const lines: OrderEmailLine[] = shipment.items
    .map((item) => ({
      name: nameByOrderItemId.get(item.orderItemId) ?? 'Item',
      quantity: item.quantity,
      imageUrl: null,
      url: null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const orderUrl = orderTrackingUrl(order.orderNumber, config)
  const faqs = faqsForShipment(config, shipment)
  const faqUrl = faqs.length > 0 ? courierFaqUrl(orderUrl) : ''
  const carrier = shipment.carrier?.trim() ?? ''

  await notifyOrderCustomer('DELIVERY_SLOT_CONFIRMED', order, {
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    deliveryDay: day,
    deliveryWindow: window,
    deliverySlotStart: shipment.deliverySlotStart ?? '',
    deliverySlotEnd: shipment.deliverySlotEnd ?? '',
    parcelItems: lines.length > 0 ? renderOrderItemsTable(lines) : '',
    hasParcelItems: lines.length > 0 ? 'true' : 'false',
    carrier,
    hasCarrier: carrier ? 'true' : 'false',
    faqUrl,
    hasFaq: faqUrl ? 'true' : 'false',
    shopName: config.shopTitle || 'Shop',
  })
}
