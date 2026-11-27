import { NextRequest, NextResponse } from 'next/server'
import { getClientIp } from '@/lib/auth/rate-limit'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { getShipmentForOrder } from '@/modules/shop/lib/db/shipments'
import { checkParcelOnView } from '@/modules/shop/lib/tracking/view-check'
import { resolveOrderViewer } from '@/modules/shop/lib/order-viewer'
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

  return NextResponse.json({ refresh: await checkParcelOnView(order, shipment) })
}
