import { NextRequest, NextResponse } from 'next/server'
import { getSiteTimezone } from '@/lib/config/timezone.server'
import { shopClosedResponse } from '@/modules/shop/lib/access'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { getShipmentForOrder, recordVehiclePosition } from '@/modules/shop/lib/db/shipments'
import { resolveOrderViewer } from '@/modules/shop/lib/order-viewer'
import { courierForShipment } from '@/modules/shop/lib/courier-faqs'
import { courierIsPolled, stageMeaning } from '@/modules/shop/lib/tracking/stage-meaning'
import { fetchVehiclePosition, positionUrl } from '@/modules/shop/lib/tracking/multidrop-position'
import { cachedVehiclePosition } from '@/modules/shop/lib/tracking/position-cache'
import { livePollIntervalMs, positionFreshness, SLOW_POLL_MS } from '@/modules/shop/lib/tracking/live-delivery'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'

// PUBLIC - where the van is, for the customer whose parcel is on it.
//
// The one thing on the order page that is NOT read from what the scheduled job
// last stored. Everything else about a delivery changes a few times a day and
// an hourly poll is generous; a van moves continuously, and an hour-old
// position drawn confidently on a map is the site telling a polite lie about
// somebody's sofa.
//
// It is driven by the page rather than by a schedule because the condition that
// matters - somebody is actually watching - is one a cron job cannot know. A
// closed tab costs nothing at all, which no faster schedule can match.
//
// WHAT NEVER LEAVES HERE
//
// The courier's tracking URL and the shop's trade reference stay server-side.
// Their tracking page carries the shop's account number and pro-forma status in
// its heading, so the browser is given coordinates and a sentence, and never an
// address it could follow.

/** Per IP. A page on the fast tick asks once a minute, and a household watching
 *  on three devices behind one address is ordinary - so this is set to catch a
 *  script, not a family. */
const RATE_LIMIT = { max: 120, windowMs: 5 * 60 * 1000 }

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const ip = getClientIpFromRequest(request)
  if (!checkInMemoryRateLimit(`live-delivery:${ip}`, RATE_LIMIT.max, RATE_LIMIT.windowMs)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // The same rule the order page itself is behind, called rather than copied -
  // see lib/order-viewer.ts. A stranger with an order id gets exactly what they
  // would get from the page: nothing that says the order exists.
  const viewer = await resolveOrderViewer(order)
  if (!viewer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const shipmentId = request.nextUrl.searchParams.get('shipment') ?? ''
  const shipment = shipmentId ? await getShipmentForOrder(order.id, shipmentId) : null
  if (!shipment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [config, timezone] = await Promise.all([getShopConfigCached(), getSiteTimezone()])
  const courier = courierForShipment(config, shipment)

  const destination = shipment.destinationLat && shipment.destinationLng
    ? { lat: shipment.destinationLat, lng: shipment.destinationLng }
    : null

  // Everything the page needs whether or not there is a van to show. `live` is
  // the page's instruction to keep asking; false stops the tick for good.
  const base = {
    live: false,
    crewLine: shipment.crewLine,
    dropsAway: shipment.dropsAway,
    destination,
    arrived: !!shipment.deliveredAt,
    pollAfterMs: SLOW_POLL_MS,
  }

  // A parcel that has arrived, a courier nobody set up for tracking, or a stage
  // that does not say a van is out. Answered rather than refused: the page has
  // asked a fair question and the answer is "nothing is moving".
  const outForDelivery = stageMeaning(courier, shipment.trackingStage) === 'out-for-delivery'
  if (shipment.deliveredAt || !courierIsPolled(courier) || !outForDelivery) {
    return NextResponse.json(base)
  }

  const url = shipment.trackingUrl && shipment.trackingClientId && shipment.trackingRouteId
    ? positionUrl(shipment.trackingUrl, shipment.trackingClientId, shipment.trackingRouteId)
    : null
  // Out for delivery, but the scheduled job has not yet read the ids the
  // courier's map needs. Keep asking on the slow tick - the next hourly run
  // fills them in, and the page picks the van up without a reload.
  if (!url) return NextResponse.json({ ...base, live: true })

  // Keyed on the round, so everyone watching this van shares one request.
  const { position, fetched } = await cachedVehiclePosition(
    `${shipment.trackingClientId}:${shipment.trackingRouteId}`,
    () => fetchVehiclePosition(url, timezone),
  )

  // Only a genuinely new answer is written. Without the guard, a page on the
  // fast tick would write the same row every minute for every viewer, to record
  // a position the shop had already been given.
  if (fetched && position) {
    await recordVehiclePosition(shipment.id, {
      lat: position.lat,
      lng: position.lng,
      heading: position.heading,
      fixedAt: position.fixedAt,
    })
  }

  // The last known position when this read found nothing. A van whose fix is
  // four minutes old is still worth drawing - the freshness line says how old
  // it is, and that is the honest version of showing it.
  const shown = position ?? (shipment.vehicleLat && shipment.vehicleLng
    ? {
        lat: shipment.vehicleLat,
        lng: shipment.vehicleLng,
        heading: shipment.vehicleHeading,
        fixedAt: shipment.vehicleFixedAt,
      }
    : null)

  return NextResponse.json({
    ...base,
    live: true,
    pollAfterMs: livePollIntervalMs(shipment.dropsAway),
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
    freshness: positionFreshness(shown?.fixedAt ?? null, new Date()),
  })
}
