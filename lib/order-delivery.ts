import { deliveryProgress, formatDeliveryDay, formatDeliveryWindow, type DeliveryProgress } from '@/modules/shop/lib/delivery-slot'
import { customerMaySeeTracking, faqsForShipment, type ShpCourier } from '@/modules/shop/lib/courier-faqs'
import type { ShpConfig } from '@/modules/shop/lib/config'
import type { ShpShipmentWithItems } from '@/modules/shop/lib/types'

// What the customer's order page needs to know about the deliveries booked on
// it: which parcel is coming when, what to call the courier, whether they may
// be handed its tracking page, and what to answer about it.
//
// One place, because three surfaces ask the same questions - the parcels card,
// the progress rail and the delivery questions - and a rail that disagrees with
// the card underneath it about which day the van is coming is worse than either
// on its own.

export type ParcelDelivery = {
  shipmentId: string
  /** The booked day as the database holds it, 'YYYY-MM-DD'. Kept alongside the
   *  worded version because this is the one that SORTS: 'Tuesday 8th of
   *  September' compares as a weekday name, which would order a set of parcels
   *  alphabetically by day of the week. */
  date: string
  /** 'Tuesday 8th of September', or '' where no day is booked. */
  day: string
  /** 'between 10:00 and 13:00', or '' until the courier confirms one. */
  window: string
  /** Where the clock has got to across the booked window. */
  progress: DeliveryProgress | null
  /** Whether the customer is offered the courier's own tracking page. */
  showTracking: boolean
  faqs: ShpCourier['faqs']
}

export function parcelDelivery(
  config: Pick<ShpConfig, 'deliveryCouriers'>,
  shipment: ShpShipmentWithItems,
  now: Date,
  timezone: string,
): ParcelDelivery {
  const date = shipment.deliveryDate ?? ''
  return {
    shipmentId: shipment.id,
    date,
    day: formatDeliveryDay(date),
    window: formatDeliveryWindow(shipment.deliverySlotStart, shipment.deliverySlotEnd),
    progress: date
      ? deliveryProgress({
          date,
          slotStart: shipment.deliverySlotStart,
          slotEnd: shipment.deliverySlotEnd,
          now,
          timezone,
        })
      : null,
    showTracking: customerMaySeeTracking(config, shipment),
    faqs: faqsForShipment(config, shipment),
  }
}

/**
 * The delivery the rail should show, out of however many parcels an order has.
 *
 * The soonest one still to arrive, because that is the next thing to happen to
 * this order and the next thing somebody has to be in for. Only once every
 * booked delivery has been and gone does it show the last of them - at which
 * point the rail is reporting history rather than a plan.
 *
 * Deliberately NOT "the one that finishes the order". A second parcel arriving
 * on Friday does not stop the first one arriving on Tuesday, and a rail that
 * skipped Tuesday because Friday is the last word would have somebody out when
 * the van came.
 */
export function railDelivery(deliveries: ParcelDelivery[]): ParcelDelivery | null {
  const booked = deliveries.filter((d) => d.day && d.progress)
  if (booked.length === 0) return null

  const upcoming = booked.filter((d) => d.progress?.phase !== 'passed')
  const pool = upcoming.length > 0 ? upcoming : booked
  // Compared on the ISO day, which sorts correctly as text and is the only
  // reason that field is carried around next to the worded one.
  const first = pool[0] as ParcelDelivery
  return upcoming.length > 0
    ? pool.reduce((soonest, d) => (soonest.date <= d.date ? soonest : d), first)
    : pool.reduce((latest, d) => (latest.date >= d.date ? latest : d), first)
}
