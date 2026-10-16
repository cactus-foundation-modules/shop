import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShipmentsForOrder } from '@/modules/shop/lib/db/shipments'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { parcelEmailVars } from '@/modules/shop/lib/delivery-slot-email'
import { courierContactFor, dialable } from '@/modules/shop/lib/courier-contact'

// "Please contact the courier to arrange your delivery."
//
// Sent from the order screen the moment staff say a parcel needs the customer
// to get in touch with its courier (migration 073). Staff pressed a button
// asking for it, so there is no once-only stamp: telling somebody twice because
// a member of staff pressed it twice is on the member of staff.
//
// Silent no-op when anything it needs has gone, and for a quiet parcel (068).
// An email is never worth failing a flag that is already recorded. True when
// an email went.

export async function sendCourierContactEmail(params: { orderId: string; shipmentId: string }): Promise<boolean> {
  const order = await getOrderById(params.orderId)
  if (!order) return false

  const shipment = (await getShipmentsForOrder(params.orderId)).find((s) => s.id === params.shipmentId)
  if (!shipment || shipment.quietCustomerEmails) return false

  const config = await getShopConfigCached()
  const contact = courierContactFor(config, shipment)
  if (!contact) return false

  await notifyOrderCustomer('COURIER_CONTACT', order, {
    ...await parcelEmailVars(order, shipment),
    // The fallback is for a parcel with no courier named at all: the sentence
    // still reads, and staff will have seen the gap on the order screen.
    carrier: contact.courierName || 'the courier',
    contactChatUrl: contact.chatUrl,
    hasContactChat: contact.chatUrl ? 'true' : 'false',
    contactPhone: contact.phone,
    contactPhoneDial: dialable(contact.phone),
    hasContactPhone: contact.phone ? 'true' : 'false',
    trackingNumber: contact.trackingNumber,
    hasTrackingNumber: contact.trackingNumber ? 'true' : 'false',
  })
  return true
}
