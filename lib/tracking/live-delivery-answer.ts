import { getSiteTimezone } from '@/lib/config/timezone.server'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShipmentForOrder, recordVehiclePosition } from '@/modules/shop/lib/db/shipments'
import { completeOrderIfEveryParcelArrived } from '@/modules/shop/lib/order-auto-complete'
import { courierForShipment } from '@/modules/shop/lib/courier-faqs'
import { courierIsPolled, stageMeaning } from '@/modules/shop/lib/tracking/stage-meaning'
import { readParcelTracking } from '@/modules/shop/lib/tracking/read-parcel'
import { storeParcelReading } from '@/modules/shop/lib/tracking/store-reading'
import { fetchVehiclePosition, positionUrl } from '@/modules/shop/lib/tracking/multidrop-position'
import { cachedVehiclePosition } from '@/modules/shop/lib/tracking/position-cache'
import { livePollIntervalMs, SLOW_POLL_MS, storedPositionFreshness } from '@/modules/shop/lib/tracking/live-delivery'
import type { LiveDeliveryState } from '@/modules/shop/components/public/DeliveryLiveMap'
import type { ShpShipment } from '@/modules/shop/lib/types'

// Where the van is, for whoever is allowed to be watching it.
//
// One answer for two doors: the customer's order page (the public
// live-delivery route, behind the order-viewer rule) and the shop's own order
// screen (the admin route, behind staff permissions). Who may ask is the
// route's business; what they are told is decided here, once, so the van on
// the shop's screen and the van on the customer's are the same van.
//
// The one thing about a delivery NOT read from what the scheduled job last
// stored. Everything else changes a few times a day and an hourly poll is
// generous; a van moves continuously, and an hour-old position drawn
// confidently on a map is the site telling a polite lie about somebody's sofa.
// While somebody is watching, the courier is also asked whether the parcel has
// arrived - otherwise a DPD delivery can sit on "any minute now" for the rest
// of the hour.
//
// The courier's tracking URL and the shop's trade reference never go into the
// answer. Their tracking page carries the shop's account number and pro-forma
// status in its heading, so the browser is given coordinates and a sentence,
// and never an address it could follow.

function destinationOf(shipment: ShpShipment): LiveDeliveryState['destination'] {
  return shipment.destinationLat && shipment.destinationLng
    ? { lat: shipment.destinationLat, lng: shipment.destinationLng }
    : null
}

/** The shipment already checked to belong to `orderId` by the caller. */
export async function liveDeliveryAnswer(orderId: string, shipment: ShpShipment): Promise<LiveDeliveryState> {
  const [config, timezone] = await Promise.all([getShopConfigCached(), getSiteTimezone()])
  const courier = courierForShipment(config, shipment)

  // Everything the page needs whether or not there is a van to show. `live` is
  // the page's instruction to keep asking; false stops the tick for good.
  const base = {
    live: false,
    crewLine: shipment.crewLine,
    dropsAway: shipment.dropsAway,
    destination: destinationOf(shipment),
    arrived: !!shipment.deliveredAt,
    pollAfterMs: SLOW_POLL_MS,
  }

  // Same rule as lib/order-delivery.ts: the courier's own flag where they
  // give one, and the stage words where they do not.
  const outForDelivery = !shipment.deliveredAt
    && (shipment.carrierOutForDelivery ?? stageMeaning(courier, shipment.trackingStage) === 'out-for-delivery')
  if (!courier || !courierIsPolled(courier) || !outForDelivery) {
    return base
  }

  // Ask the courier while somebody is watching. The hourly job is too slow
  // once a parcel is down to "any minute now", and a courier whose van comes
  // in with the read (AIT, DPD) has no separate endpoint for us to poll.
  let current = shipment
  const reading = await readParcelTracking(courier, shipment, timezone)
  if (reading?.stage) {
    const { delivered } = await storeParcelReading(courier, shipment, reading, timezone)
    if (delivered) {
      // Finished off here and now, not left for the hourly job. This parcel
      // has just dropped out of that job's queue, and the page is about to
      // reload - it should reload onto a completed order, not a dispatched one
      // with a delivered parcel on it. A failure here is logged and nothing
      // more: the delivery is already recorded, and the hourly job's leftovers
      // sweep finishes the order off on its next run.
      await completeOrderIfEveryParcelArrived(orderId).catch((error: unknown) => {
        console.error('[shop] could not complete delivered order', orderId, error)
      })
      return { ...base, arrived: true, refreshPage: true }
    }
    // The van has been and could not deliver. The page is showing a map of a
    // delivery that is no longer happening, so it reloads onto what to do next.
    if (stageMeaning(courier, reading.stage) === 'failed') {
      return { ...base, refreshPage: true }
    }
    const refreshed = await getShipmentForOrder(orderId, shipment.id)
    if (refreshed) current = refreshed
  }

  const url = current.trackingUrl && current.trackingClientId && current.trackingRouteId
    ? positionUrl(current.trackingUrl, current.trackingClientId, current.trackingRouteId)
    : null
  // No separate map endpoint to ask. Either the courier hands the crew's
  // position over as part of the read (AIT, DPD), in which case
  // the reading above has just written it to the row, or this is a Multidrop
  // parcel whose ids the scheduled job has not read yet - keep asking on the
  // slow tick, and the page picks the van up without a reload once they land.
  if (!url) {
    const stored = current.vehicleLat && current.vehicleLng
      ? {
          lat: current.vehicleLat,
          lng: current.vehicleLng,
          heading: current.vehicleHeading,
          fixedAt: current.vehicleFixedAt ? current.vehicleFixedAt.toISOString() : null,
        }
      : null
    return {
      ...base,
      // From the row as this read left it: the drop can land with the same
      // read as the van (DPD geocode it only once the parcel is on a round).
      destination: destinationOf(current),
      live: true,
      crewLine: current.crewLine,
      dropsAway: current.dropsAway,
      pollAfterMs: livePollIntervalMs(current.dropsAway),
      ...(stored
        ? {
            position: stored,
            freshness: storedPositionFreshness(current.vehicleFixedAt, current.vehiclePolledAt, new Date()),
          }
        : {}),
    }
  }

  // Keyed on the round, so everyone watching this van shares one request.
  const { position, fetched } = await cachedVehiclePosition(
    `${current.trackingClientId}:${current.trackingRouteId}`,
    () => fetchVehiclePosition(url, timezone),
  )

  // Only a genuinely new answer is written. Without the guard, a page on the
  // fast tick would write the same row every minute for every viewer, to record
  // a position the shop had already been given.
  if (fetched && position) {
    await recordVehiclePosition(current.id, {
      lat: position.lat,
      lng: position.lng,
      heading: position.heading,
      fixedAt: position.fixedAt,
    })
  }

  // The last known position when this read found nothing. A van whose fix is
  // four minutes old is still worth drawing - the freshness line says how old
  // it is, and that is the honest version of showing it.
  const shown = position ?? (current.vehicleLat && current.vehicleLng
    ? {
        lat: current.vehicleLat,
        lng: current.vehicleLng,
        heading: current.vehicleHeading,
        fixedAt: current.vehicleFixedAt,
      }
    : null)

  return {
    ...base,
    // From the row as this read left it: the drop can land with the same
    // read as the van (DPD geocode it only once the parcel is on a round).
    destination: destinationOf(current),
    live: true,
    crewLine: current.crewLine,
    dropsAway: current.dropsAway,
    pollAfterMs: livePollIntervalMs(current.dropsAway),
    position: shown
      ? {
          lat: shown.lat,
          lng: shown.lng,
          heading: shown.heading,
          fixedAt: shown.fixedAt ? shown.fixedAt.toISOString() : null,
        }
      : null,
    // Worded here rather than in the browser, so one machine's clock being
    // wrong cannot age somebody else's delivery.
    // The same rule the page renders with, so the first tick never rewords it:
    // the van's own time where it gave one, else when we last asked.
    freshness: storedPositionFreshness(
      shown?.fixedAt ?? null,
      position ? new Date() : current.vehiclePolledAt,
      new Date(),
    ),
  }
}
