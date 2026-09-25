import { getShopConfigCached } from '@/modules/shop/lib/config'
import { claimFailedDeliveryNotification, getShipmentsForOrder } from '@/modules/shop/lib/db/shipments'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { courierForShipment, courierWillRebook } from '@/modules/shop/lib/courier-faqs'
import { safeTrackingUrl } from '@/modules/shop/lib/tracking-url'
import { failedReason } from '@/modules/shop/lib/tracking/stage-meaning'
import type { ShpShipment } from '@/modules/shop/lib/types'

// "We could not deliver your order."
//
// Sent off the courier's own tracking, the first time a parcel reaches a stage
// the shop's settings say means the delivery failed. The order page already
// says so, but only to somebody who opens it - and the person who missed the
// van is precisely the one not sitting on the order page.
//
// Once per failed attempt. The claim is taken before the send and never given
// back, as every other once-only email here does: a mail server refusing the
// message has not un-failed the delivery, and the next hourly check resending it
// would land a second copy on somebody already annoyed. The claim is released
// by the courier's stage moving on (recordTrackingStage), so a second failed
// attempt is a second email.
//
// Silent no-op when anything it needs has gone. An email is never worth failing
// the tracking write that already happened.

/** Digits and a leading plus, for a tel: link. What the customer SEES stays as
 *  the owner typed it - "0121 285 5255" reads better than "01212855255". */
function dialable(phone: string): string {
  return phone.replace(/[^\d+]/g, '')
}

/** The claim is the whole check, and it is read off the row rather than off
 *  `parcel`: the caller's copy was read before the stage was written, and
 *  writing a new stage is exactly what releases the previous claim. */
export async function maybeSendFailedDeliveryEmail(
  parcel: Pick<ShpShipment, 'id' | 'orderId'>,
): Promise<boolean> {
  if (!(await claimFailedDeliveryNotification(parcel.id))) return false

  try {
    await sendFailedDeliveryEmail({ orderId: parcel.orderId, shipmentId: parcel.id })
  } catch (error) {
    console.error('[shop] failed-delivery email failed', error)
  }
  return true
}

export async function sendFailedDeliveryEmail(params: { orderId: string; shipmentId: string }): Promise<void> {
  const order = await getOrderById(params.orderId)
  if (!order) return

  const shipment = (await getShipmentsForOrder(params.orderId)).find((s) => s.id === params.shipmentId)
  if (!shipment) return

  const config = await getShopConfigCached()
  const courier = courierForShipment(config, shipment)
  const carrier = courier?.name.trim() || shipment.carrier?.trim() || 'the courier'
  const trackingNumber = shipment.trackingNumber?.trim() ?? ''

  // Read at send time, so a parcel staff flagged before the email went is told
  // to wait rather than to chase. The courier's chat and phone go either way:
  // told to wait, a customer may still want them sooner.
  const courierWillContact = courierWillRebook(courier, shipment)
  const chatUrl = safeTrackingUrl(courier?.rearrangeChatUrl)
  const phone = courier?.rearrangePhone.trim() ?? ''
  const reason = courier?.showFailedReason ? failedReason(courier, shipment.trackingStage) : ''

  await notifyOrderCustomer('DELIVERY_FAILED', order, {
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    carrier,
    trackingNumber,
    hasTrackingNumber: trackingNumber ? 'true' : 'false',
    failedReason: reason,
    hasFailedReason: reason ? 'true' : 'false',
    rebookChatUrl: chatUrl,
    hasRebookChat: chatUrl ? 'true' : 'false',
    rebookPhone: phone,
    rebookPhoneDial: dialable(phone),
    hasRebookPhone: phone ? 'true' : 'false',
    // The "or reach them sooner" line: only when told to wait, and only with
    // something to reach them by. One flag, because {{#if}} does not nest.
    hasReachSooner: courierWillContact && (chatUrl || phone) ? 'true' : 'false',
    hasContactCourier: courierWillContact ? 'false' : 'true',
    hasCourierWillContact: courierWillContact ? 'true' : 'false',
    shopName: config.shopTitle || 'Shop',
  })
}
