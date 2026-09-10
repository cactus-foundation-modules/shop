import {
  deliveryProgress,
  formatDeliveryDayRelative,
  formatDeliveryWindowSpoken,
  nowInTimezone,
  type DeliveryProgress,
} from '@/modules/shop/lib/delivery-slot'
import { courierForShipment, customerMaySeeTracking, faqsForShipment, type ShpCourier } from '@/modules/shop/lib/courier-faqs'
import { stageMeaning } from '@/modules/shop/lib/tracking/stage-meaning'
import { liveProgress, type LiveProgress } from '@/modules/shop/lib/tracking/live-line'
import type { TrackingEvent } from '@/modules/shop/lib/tracking/reading'
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
  /** 'tomorrow', 'Thursday', or 'Tuesday 8th of September' once it is far
   *  enough out to need the date. Relative because this is only ever rendered
   *  on request - an EMAIL must use the absolute form, since "tomorrow" is
   *  wrong by breakfast. */
  day: string
  /** 'between 10am and 1pm', or '' until the courier confirms one. */
  window: string
  /** Where the clock has got to across the booked window. */
  progress: DeliveryProgress | null
  /** The courier's own tracking says a van is out with it. Beats the clock,
   *  which only ever knew what was BOOKED - a delivery can run early, run late,
   *  or not happen at all, and the courier is the one who knows. */
  outForDelivery: boolean
  /** The courier says it has arrived. Again, better evidence than the window
   *  having elapsed. */
  arrived: boolean
  /** Whether the customer is offered the courier's own tracking page. */
  showTracking: boolean
  /** What that button says, and the line under it. The courier's setting where
   *  they have one, and the wording the shop has always used where they have
   *  not - which is what every shop that never touches it keeps. */
  trackingLabel: string
  trackingHint: string
  /** Where the driver has got to, in words. Empty parts where the courier has
   *  not said, and never inferred from the clock. */
  live: LiveProgress
  /** The courier's own history for this parcel, newest first. */
  events: TrackingEvent[]
  faqs: ShpCourier['faqs']
}

/** What the button out to the courier says when nobody has changed it. The
 *  wording the shop used before couriers had their own, so an install that
 *  updates into this feature sees no difference. */
export const DEFAULT_TRACKING_LABEL = 'Track your parcel'

export function parcelDelivery(
  config: Pick<ShpConfig, 'deliveryCouriers'>,
  shipment: ShpShipmentWithItems,
  now: Date,
  timezone: string,
): ParcelDelivery {
  const date = shipment.deliveryDate ?? ''
  const courier = courierForShipment(config, shipment)
  const meaning = stageMeaning(courier, shipment.trackingStage)
  const progress = date
    ? deliveryProgress({
        date,
        slotStart: shipment.deliverySlotStart,
        slotEnd: shipment.deliverySlotEnd,
        now,
        timezone,
      })
    : null

  return {
    shipmentId: shipment.id,
    date,
    day: formatDeliveryDayRelative(date, nowInTimezone(now, timezone).date),
    window: formatDeliveryWindowSpoken(shipment.deliverySlotStart, shipment.deliverySlotEnd),
    progress,
    // The courier's own flag where they report one, and the owner's reading of
    // their stage words where they do not. Same rule as `delivered` in the
    // poller: a boolean from the carrier beats a sentence somebody matched.
    outForDelivery: shipment.carrierOutForDelivery ?? meaning === 'out-for-delivery',
    // Delivered is the courier's word for it where there is one, and the window
    // having gone by where there is not. The clock is the weaker of the two and
    // never overrules the stronger.
    arrived: meaning === 'delivered'
      || (meaning === 'progress' && progress?.phase === 'passed'),
    showTracking: customerMaySeeTracking(config, shipment),
    trackingLabel: courier?.trackingLinkLabel.trim() || DEFAULT_TRACKING_LABEL,
    trackingHint: courier?.trackingLinkHint.trim() ?? '',
    // Only while it is actually out with a driver. The numbers persist in the
    // row until the next poll overwrites them, and a stop number shown against
    // a parcel that arrived yesterday would be a sentence about nothing.
    live: (shipment.carrierOutForDelivery ?? meaning === 'out-for-delivery')
      ? liveProgress({
          driverName: shipment.driverName,
          stopNumber: shipment.stopNumber,
          stopsCompleted: shipment.stopsCompleted,
          stopsTotal: shipment.stopsTotal,
          minutesToStop: shipment.minutesToStop,
          checkedAt: shipment.trackingCheckedAt,
          now,
        })
      : { round: '', yours: '', fraction: null },
    events: shipment.trackingEvents,
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

  const upcoming = booked.filter((d) => !d.arrived)
  const pool = upcoming.length > 0 ? upcoming : booked
  // Compared on the ISO day, which sorts correctly as text and is the only
  // reason that field is carried around next to the worded one.
  const first = pool[0] as ParcelDelivery
  return upcoming.length > 0
    ? pool.reduce((soonest, d) => (soonest.date <= d.date ? soonest : d), first)
    : pool.reduce((latest, d) => (latest.date >= d.date ? latest : d), first)
}
