import { getSiteTimezone } from '@/lib/config/timezone.server'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { claimViewerTrackingCheck } from '@/modules/shop/lib/db/shipments'
import { completeOrderIfEveryParcelArrived } from '@/modules/shop/lib/order-auto-complete'
import { courierForShipment } from '@/modules/shop/lib/courier-faqs'
import { courierIsPolled } from '@/modules/shop/lib/tracking/stage-meaning'
import { readParcelTracking } from '@/modules/shop/lib/tracking/read-parcel'
import { storeParcelReading } from '@/modules/shop/lib/tracking/store-reading'
import { VIEW_CHECK_MIN_AGE_MINUTES } from '@/modules/shop/lib/tracking/live-delivery'
import type { ShpOrder } from '@/modules/shop/lib/types'

// Ask the courier about one parcel because somebody has just opened its order.
//
// Shared by the customer's order page and the shop's own order screen, so the
// two cannot disagree about what "opening an order" asks the courier. The
// callers decide who may ask; this decides whether there is anything to ask
// and whether it has been asked recently enough already.
//
// The answer is only ever whether the page should re-render. What the courier
// said is written to the parcel and the page reads it from there, exactly as it
// reads what the hourly job wrote - there is one way in for tracking, not two.
export async function checkParcelOnView(
  order: Pick<ShpOrder, 'id' | 'status'>,
  shipment: Parameters<typeof courierForShipment>[1] & Parameters<typeof readParcelTracking>[1] & {
    id: string
    deliveredAt?: unknown
    trackingUrl?: string | null
    trackingShortCode?: string | null
  },
): Promise<boolean> {
  // Nothing to ask about: already here, on a courier the shop does not follow,
  // on an order called off, or with nothing to follow it by.
  const config = await getShopConfigCached()
  const courier = courierForShipment(config, shipment)
  if (
    shipment.deliveredAt
    || !courier
    || !courierIsPolled(courier)
    || order.status === 'CANCELLED'
    || order.status === 'REFUNDED'
    || !(shipment.trackingUrl || shipment.trackingShortCode)
  ) {
    return false
  }

  // Asked within the last few minutes, by this viewer or anybody else. What
  // was learned is already on the page.
  if (!(await claimViewerTrackingCheck(shipment.id, VIEW_CHECK_MIN_AGE_MINUTES))) return false

  const timezone = await getSiteTimezone()
  const reading = await readParcelTracking(courier, shipment, timezone)
  // A courier having a moment is not news. The claim above has stamped the
  // parcel as looked at, and the next open or the hourly job asks again.
  if (!reading?.stage) return false

  const { delivered } = await storeParcelReading(courier, shipment, reading, timezone)
  if (delivered) {
    // Finished off here, as the live map does, so the reload lands on a
    // completed order. A failure is logged and left to the hourly job's
    // leftovers sweep - the delivery itself is already recorded.
    await completeOrderIfEveryParcelArrived(order.id).catch((error: unknown) => {
      console.error('[shop] could not complete delivered order', order.id, error)
    })
  }

  // Events, the window and the driver can change without the stage moving, so
  // a reading that says anything at all is worth a re-render.
  return true
}
