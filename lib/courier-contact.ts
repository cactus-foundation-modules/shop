import type { ShpConfig } from '@/modules/shop/lib/config'
import type { ShpShipment } from '@/modules/shop/lib/types'
import { courierForShipment } from '@/modules/shop/lib/courier-faqs'
import { safeTrackingUrl } from '@/modules/shop/lib/tracking-url'

// "Ring the courier to arrange this delivery."
//
// Some couriers - Furdeco among them - do not book the day with the customer
// from the shop's side: the customer has to get in touch and agree one. It is
// true of some parcels and not others, so it is a flag staff set on the parcel
// (migration 073), and the customer's order page and one email act on it.
//
// The ways to reach the courier are the ones the courier already carries for a
// failed delivery (rearrangeChatUrl and rearrangePhone). One set of contact
// details per courier, not one per reason somebody might need them.

export type CourierContact = {
  /** Who to contact, in the name the customer already knows them by. */
  courierName: string
  /** The courier's own chat page, checked as a link before it gets here. '' for
   *  none. */
  chatUrl: string
  /** '' for none. */
  phone: string
  /** The number the courier will ask for. '' for none. */
  trackingNumber: string
}

/** Digits and a leading plus, for a tel: link. What the customer SEES stays as
 *  the owner typed it - "0121 285 5255" reads better than "01212855255". */
export function dialable(phone: string): string {
  return phone.replace(/[^\d+]/g, '')
}

/** Whether staff have told this parcel's customer to contact the courier. */
export function customerMustContactCourier(shipment: Pick<ShpShipment, 'courierContactAt'>): boolean {
  return Boolean(shipment.courierContactAt)
}

/** How the customer reaches the courier about this parcel. Null when nobody
 *  has said they must - this does not decide whether it is still worth saying
 *  (a parcel that has arrived is not), which is the page's call. */
export function courierContactFor(
  config: Pick<ShpConfig, 'deliveryCouriers'>,
  shipment: Pick<ShpShipment, 'courierId' | 'carrier' | 'trackingNumber' | 'courierContactAt'>,
): CourierContact | null {
  if (!customerMustContactCourier(shipment)) return null
  const courier = courierForShipment(config, shipment)
  return {
    courierName: courier?.name.trim() || shipment.carrier?.trim() || '',
    chatUrl: safeTrackingUrl(courier?.rearrangeChatUrl),
    phone: courier?.rearrangePhone.trim() ?? '',
    trackingNumber: shipment.trackingNumber?.trim() ?? '',
  }
}
