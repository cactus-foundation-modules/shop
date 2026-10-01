import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { releaseQuietShipment } from '@/modules/shop/lib/db/shipments'
import { sendShipmentDispatchedEmail } from '@/modules/shop/lib/shipment-email'

const Body = z.object({ shipmentId: z.string().min(1).max(64) })

// PROTECTED - send the dispatch note for a quiet parcel.
//
// A parcel recorded from a supplier's tracking while the shop was set to
// "record only" goes on the order quiet (migration 068): its customer has not
// been told, and nothing that follows from it tells them. This is the owner
// deciding they should be: the flag comes off, so the parcel behaves like any
// other from now on, and the customer gets the dispatch note a parcel recorded
// by hand would have sent, tracking and all.
//
// Same permission as recording a dispatch. The flag is cleared by the same
// statement that checks it, so two presses send one note.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'No parcel was named.' }, { status: 400 })

  const released = await releaseQuietShipment(parsed.data.shipmentId, id)
  if (!released) {
    return NextResponse.json({ error: 'That parcel has already been announced to the customer.' }, { status: 409 })
  }

  try {
    await sendShipmentDispatchedEmail({ orderId: id, shipmentId: parsed.data.shipmentId })
  } catch (error) {
    // The flag is off either way: the parcel now behaves like any other, and
    // the order's history says whether the email went.
    console.error('[shop] dispatch note for a quiet parcel failed', error)
    return NextResponse.json({ error: 'The parcel is no longer quiet, but the email could not be sent. Try Resend from the order history.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
