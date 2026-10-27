import { NextRequest, NextResponse } from 'next/server'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { getShipmentForOrder } from '@/modules/shop/lib/db/shipments'
import { resolveOrderViewer } from '@/modules/shop/lib/order-viewer'
import { liveDeliveryAnswer } from '@/modules/shop/lib/tracking/live-delivery-answer'
import { checkInMemoryRateLimit } from '@/modules/shop/lib/rate-limit'
import { getClientIp } from '@/lib/auth/rate-limit'

// PUBLIC - where the van is, for the customer whose parcel is on it.
//
// Who may ask is decided here; what they are told is decided in
// lib/tracking/live-delivery-answer.ts, which the shop's own order screen asks
// too (the admin live-delivery route). See there for why this is the one thing
// on the order page read live rather than from what the scheduled job stored.
//
// It is driven by the page rather than by a schedule because the condition that
// matters - somebody is actually watching - is one a cron job cannot know. A
// closed tab costs nothing at all, which no faster schedule can match.

/** Per IP. A page on the fast tick asks once a minute, and a household watching
 *  on three devices behind one address is ordinary - so this is set to catch a
 *  script, not a family. */
const RATE_LIMIT = { max: 120, windowMs: 5 * 60 * 1000 }

// Deliberately NOT behind the shop gate: a parcel already on its way is
// post-purchase, and its customer is owed where it has got to while the shop is
// closed (see getShopGate in lib/access.ts).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = await getClientIp()
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

  return NextResponse.json(await liveDeliveryAnswer(order.id, shipment))
}
