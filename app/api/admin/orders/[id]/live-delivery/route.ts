import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { getShipmentForOrder } from '@/modules/shop/lib/db/shipments'
import { liveDeliveryAnswer } from '@/modules/shop/lib/tracking/live-delivery-answer'

// ADMIN - where the van is, for the shop's own order screen.
//
// The same answer the customer's order page is given (see
// lib/tracking/live-delivery-answer.ts), behind staff permissions instead of
// the order-viewer rule. Staff are asked "where's my desk?" on the phone; the
// screen they answer from should show the van the customer is looking at, not
// send them off to the courier's site with a parcel number.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const shipmentId = request.nextUrl.searchParams.get('shipment') ?? ''
  const shipment = shipmentId ? await getShipmentForOrder(order.id, shipmentId) : null
  if (!shipment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(await liveDeliveryAnswer(order.id, shipment))
}
