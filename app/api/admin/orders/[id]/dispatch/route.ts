import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById, getOrderItems, outstandingPreOrderItems } from '@/modules/shop/lib/db/orders'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import {
  createShipment,
  deleteShipment,
  getOrderDispatchSummary,
  getShipmentsForOrder,
} from '@/modules/shop/lib/db/shipments'
import { sendShipmentDispatchedEmail } from '@/modules/shop/lib/shipment-email'
import type { ShpOrderItem } from '@/modules/shop/lib/types'

const Body = z.object({
  items: z.array(z.object({ orderItemId: z.string(), quantity: z.number().int().min(1) })).min(1),
  trackingNumber: z.string().nullable().optional(),
  carrier: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  // Owners back-date a parcel that went out on Friday and is only being
  // recorded on Monday, so a plain date string from the admin is accepted and
  // coerced here rather than being rejected as "not an ISO timestamp".
  shippedAt: z.coerce.date().nullable().optional(),
  emailCustomer: z.boolean().optional(),
})

// The hold rule itself lives in lib/db/orders.ts. Here it is read-only: this
// route only EXPLAINS the hold to the owner, while the status route ENFORCES it.
// Both must give the same answer, which is why neither keeps its own copy.

// Everything the order screen needs to show dispatch progress in one call: the
// per-line summary, the shipments already recorded, and whether the shop's
// hold-everything pre-order policy currently applies to this order. It rides on
// this route rather than the main order GET so the dispatch block can refresh
// itself after a dispatch without re-fetching the whole order.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const [summary, shipments, config, items] = await Promise.all([
    getOrderDispatchSummary(id),
    getShipmentsForOrder(id),
    getShopConfigCached(),
    getOrderItems(id),
  ])

  const holdAll = config.preOrderMixedCartBehaviour === 'HOLD_ALL'
  const outstanding = holdAll ? await outstandingPreOrderItems(items) : []
  // The whole order waits on the last item to arrive, so the latest known date
  // is the one worth naming.
  const expectedDate = outstanding
    .map((i) => i.preOrderDispatchDate)
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime())[0]

  return NextResponse.json({
    summary,
    shipments,
    preOrderHold: {
      active: holdAll && outstanding.length > 0,
      outstandingCount: outstanding.length,
      expectedDate: expectedDate ? expectedDate.toISOString() : null,
    },
  })
}

// PROTECTED - records one dispatch of a subset of an order's lines.
//
// Every cap (nothing dispatched twice, nothing dispatched that has since been
// refunded) is policed inside createShipment, under the same advisory lock
// refunds take, so a refund landing mid-request cannot slip past the checks.
// Its rejections already read as plain English for a shop owner, so they are
// handed back verbatim rather than being re-worded or re-derived here.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid dispatch' }, { status: 400 })

  const outcome = await createShipment({
    orderId: id,
    shippedAt: parsed.data.shippedAt ?? null,
    trackingNumber: parsed.data.trackingNumber ?? null,
    carrier: parsed.data.carrier ?? null,
    notes: parsed.data.notes ?? null,
    items: parsed.data.items,
  })

  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })

  // The parcel is out and the shipment is recorded whatever the mail server
  // thinks. A bounced send must not roll that back or report a failure the
  // owner would act on by dispatching all over again, so it is logged and
  // stepped over - the same treatment a status-change email gets.
  if (parsed.data.emailCustomer) {
    try {
      await sendShipmentDispatchedEmail({ orderId: id, shipmentId: outcome.shipment.id })
    } catch (error) {
      console.error('[shop] dispatch email failed', error)
    }
  }

  return NextResponse.json({ shipment: outcome.shipment }, { status: 201 })
}

// Undo a dispatch recorded by mistake. The dispatched totals are summed from
// the shipment's lines rather than held in a counter, so deleting the shipment
// is all it takes for the units to go back to outstanding.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const shipmentId = request.nextUrl.searchParams.get('shipmentId')
  if (!shipmentId) return NextResponse.json({ error: 'No dispatch was named to undo.' }, { status: 400 })

  // Scoped to this order, so a shipment id from elsewhere cannot be deleted
  // through an order the caller happens to be allowed to see.
  const deleted = await deleteShipment(shipmentId, id)
  if (!deleted) return NextResponse.json({ error: 'That dispatch is no longer on this order.' }, { status: 404 })

  return NextResponse.json({ success: true })
}
