import { NextRequest, NextResponse } from 'next/server'
import { getSiteTimezone } from '@/lib/config/timezone.server'
import { getClientIp } from '@/lib/auth/rate-limit'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { claimViewerTrackingCheck, getShipmentForOrder } from '@/modules/shop/lib/db/shipments'
import { completeOrderIfEveryParcelArrived } from '@/modules/shop/lib/order-auto-complete'
import { resolveOrderViewer } from '@/modules/shop/lib/order-viewer'
import { courierForShipment } from '@/modules/shop/lib/courier-faqs'
import { courierIsPolled } from '@/modules/shop/lib/tracking/stage-meaning'
import { readParcelTracking } from '@/modules/shop/lib/tracking/read-parcel'
import { storeParcelReading } from '@/modules/shop/lib/tracking/store-reading'
import { VIEW_CHECK_MIN_AGE_MINUTES } from '@/modules/shop/lib/tracking/live-delivery'
import { checkInMemoryRateLimit } from '@/modules/shop/lib/rate-limit'

// PUBLIC - ask the courier about one parcel because somebody has just opened
// its order.
//
// The hourly job is the floor, not the answer. A customer who opens their
// order is asking "where is it" NOW, and making them wait up to an hour for a
// question DPD could answer in half a second is the shop being slower than a
// courier's own email. The live map already asks on view, but only for a
// parcel the shop has already been told is out for delivery - a parcel it has
// never managed to read, or one read yesterday afternoon, was left for the
// schedule. This covers every parcel still on its way.
//
// Called once per page open, not polled: anything faster than that is the live
// map's job. Throttled per parcel by claimViewerTrackingCheck, so a customer
// hammering reload, or a household on three devices, costs the courier one
// request every few minutes between them.
//
// The answer is only ever whether the page should re-render. What the courier
// said is written to the parcel and the page reads it from there, exactly as it
// reads what the hourly job wrote - there is one way in for tracking, not two.

/** Per IP. One call per page open, so this only has to catch a script. */
const RATE_LIMIT = { max: 60, windowMs: 5 * 60 * 1000 }

// Deliberately NOT behind the shop gate, for the same reason as live-delivery:
// a parcel already on its way is owed its tracking while the shop is closed.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = await getClientIp()
  if (!checkInMemoryRateLimit(`tracking-check:${ip}`, RATE_LIMIT.max, RATE_LIMIT.windowMs)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // The same rule the order page is behind - see lib/order-viewer.ts.
  const viewer = await resolveOrderViewer(order)
  if (!viewer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const shipmentId = request.nextUrl.searchParams.get('shipment') ?? ''
  const shipment = shipmentId ? await getShipmentForOrder(order.id, shipmentId) : null
  if (!shipment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
    return NextResponse.json({ refresh: false })
  }

  // Asked within the last few minutes, by this viewer or anybody else. What
  // was learned is already on the page.
  if (!(await claimViewerTrackingCheck(shipment.id, VIEW_CHECK_MIN_AGE_MINUTES))) {
    return NextResponse.json({ refresh: false })
  }

  const timezone = await getSiteTimezone()
  const reading = await readParcelTracking(courier, shipment, timezone)
  // A courier having a moment is not news. The claim above has stamped the
  // parcel as looked at, and the next open or the hourly job asks again.
  if (!reading?.stage) return NextResponse.json({ refresh: false })

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
  // a reading that says anything at all is worth a re-render. It is at most one
  // per parcel per few minutes.
  return NextResponse.json({ refresh: true })
}
