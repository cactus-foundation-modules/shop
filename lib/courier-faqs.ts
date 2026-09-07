import type { ShpConfig } from '@/modules/shop/lib/config'
import type { ShpShipment } from '@/modules/shop/lib/types'

// Which courier a parcel went with, and what that means for the customer.
//
// Two questions hang off it, both answered here so the email, the order page
// and the guest tracking page cannot disagree:
//
//   - which questions to offer about this delivery, and
//   - whether the customer is shown the courier's own tracking page at all.
//
// That second one is not squeamishness. Some couriers' "tracking" page is
// really the shop's trade portal: account number, pro-forma status, the
// supplier's own branding and telephone number, all in front of the person who
// bought a chair. The link is still recorded and still shown to staff on the
// order screen; it is simply not handed to the customer.

export type ShpCourier = ShpConfig['deliveryCouriers'][number]

type ShipmentCourierFields = Pick<ShpShipment, 'courierId' | 'carrier'>

/**
 * The configured courier for a parcel, or null.
 *
 * By id first, which is what dispatch records. Falling back to the NAME matters
 * more than it looks: every parcel recorded before the courier list existed has
 * a typed-in carrier and no id, and matching those means an owner who adds
 * "Furdeco" to the list today gets the right behaviour on the deliveries
 * already in flight, rather than only on the next one.
 */
export function courierForShipment(
  config: Pick<ShpConfig, 'deliveryCouriers'>,
  shipment: ShipmentCourierFields,
): ShpCourier | null {
  const byId = shipment.courierId
    ? config.deliveryCouriers.find((c) => c.id === shipment.courierId)
    : undefined
  if (byId) return byId

  const name = shipment.carrier?.trim().toLowerCase()
  if (!name) return null
  return config.deliveryCouriers.find((c) => c.name.trim().toLowerCase() === name) ?? null
}

/** The questions worth answering about this delivery. Empty for a courier with
 *  none, and for a carrier that was typed in and never configured - in which
 *  case nothing is shown at all rather than an empty box. */
export function faqsForShipment(
  config: Pick<ShpConfig, 'deliveryCouriers'>,
  shipment: ShipmentCourierFields,
): ShpCourier['faqs'] {
  return courierForShipment(config, shipment)?.faqs ?? []
}

/** Whether the customer is offered the courier's own tracking page. True for
 *  an unconfigured carrier, which is how the shop behaved before couriers were
 *  a list: a recorded link was shown. */
export function customerMaySeeTracking(
  config: Pick<ShpConfig, 'deliveryCouriers'>,
  shipment: ShipmentCourierFields,
): boolean {
  const courier = courierForShipment(config, shipment)
  return courier ? courier.showTrackingLink : true
}

/** The query the order page opens its delivery questions on. */
export const FAQ_QUERY_KEY = 'faq'

/**
 * The order page, asked to open its delivery questions.
 *
 * Built by parsing rather than by appending a string: the order link already
 * carries a token on it for guests, and "?" pasted onto a url that has one
 * makes an address that opens nothing and proves nothing.
 *
 * Empty in, empty out - a shop with guest tracking switched off has no order
 * link to send anybody to, and the {{#if}} in the email takes the line with it.
 */
export function courierFaqUrl(orderUrl: string): string {
  if (!orderUrl) return ''
  try {
    const url = new URL(orderUrl)
    url.searchParams.set(FAQ_QUERY_KEY, '1')
    return url.toString()
  } catch {
    return ''
  }
}
