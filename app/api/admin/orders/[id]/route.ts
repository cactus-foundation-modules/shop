import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getCustomerSummary, getOrderById, getOrderItems, listOrderNotes, listOrderEmails } from '@/modules/shop/lib/db/orders'
import { listRefundsForOrder, listRefundItemsForOrder } from '@/modules/shop/lib/db/refunds'
import { listDownloadsForOrder } from '@/modules/shop/lib/db/digital'

// Everything the order screen shows in one call, apart from dispatch progress -
// that rides on its own route so the dispatch block can refresh itself after a
// parcel without re-reading the whole order.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const [items, notes, emails, refunds, refundItems, downloads, customer] = await Promise.all([
    getOrderItems(id),
    listOrderNotes(id),
    listOrderEmails(id),
    listRefundsForOrder(id),
    listRefundItemsForOrder(id),
    listDownloadsForOrder(id),
    getCustomerSummary(order.customerEmail),
  ])

  // Who wrote a note and who took a refund, resolved to names. A note signed
  // with a cuid tells the owner nothing about which of their staff wrote it,
  // and a deleted user simply drops out of the map rather than breaking the
  // screen (the timeline falls back to "a member of staff").
  const authorIds = [...new Set([
    ...notes.map((n) => n.createdBy),
    ...refunds.map((r) => r.createdBy),
  ].filter((v): v is string => Boolean(v)))]
  const authorRows = authorIds.length
    ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, displayName: true, username: true } })
    : []
  const authors = Object.fromEntries(authorRows.map((u) => [u.id, u.displayName || u.username]))

  return NextResponse.json({ order, items, notes, emails, refunds, refundItems, downloads, customer, authors })
}
