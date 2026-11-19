import { NextRequest, NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { addOrderNote, getOrderById } from '@/modules/shop/lib/db/orders'
import { addRequestPhotos, getRequestById } from '@/modules/shop/lib/db/order-requests'
import { receiveIssuePhoto } from '@/modules/shop/lib/issue-photos'

// PROTECTED - staff adding a photograph to an issue report: the one the customer
// emailed in instead, a courier's picture, the warehouse's own shot of the
// carton. One file per request, like the customer's upload, so a slow
// connection loses one photograph rather than all of them.
//
// Filed in the same folder as the customer's (lib/issue-photos.ts) and recorded
// with whoever added it, so the queue can tell the two apart. Allowed on a
// settled report too: the record of what happened is still worth completing.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const report = await getRequestById(id)
  if (!report) return NextResponse.json({ error: 'That report no longer exists.' }, { status: 404 })
  if (report.type !== 'DAMAGE') {
    return NextResponse.json({ error: 'Photographs only go on an issue report.' }, { status: 400 })
  }
  const order = await getOrderById(report.orderId)
  if (!order) return NextResponse.json({ error: 'That order no longer exists.' }, { status: 404 })

  const received = await receiveIssuePhoto(request, order.orderNumber)
  if (!received.ok) return NextResponse.json({ error: received.error }, { status: received.status })

  const added = await addRequestPhotos(report.id, [{ mediaId: received.mediaId, url: received.url }], gate.user.id)
  if (!added.ok) return NextResponse.json({ error: added.error }, { status: added.status })

  await addOrderNote(order.id, 'A photograph was added to the customer\'s report from the queue.', true, gate.user.id)
  return NextResponse.json({ photo: added.photos[0] }, { status: 201 })
}
