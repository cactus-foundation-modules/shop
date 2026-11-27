import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { getShipmentForOrder } from '@/modules/shop/lib/db/shipments'
import { checkParcelOnView } from '@/modules/shop/lib/tracking/view-check'

// ADMIN - ask the courier about one parcel because staff have just opened its
// order. The customer's page already does this on open (see the public route);
// without it the shop's own screen showed whatever the hourly job last heard,
// so a delivery hour DPD had published since was missing for up to an hour.
// Same shared check, same per-parcel throttle, behind staff permissions.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const shipmentId = request.nextUrl.searchParams.get('shipment') ?? ''
  const shipment = shipmentId ? await getShipmentForOrder(order.id, shipmentId) : null
  if (!shipment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ refresh: await checkParcelOnView(order, shipment) })
}
