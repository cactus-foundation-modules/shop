import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getCustomerSummary, getOrderById, getOrderItems, listOrderNotes, listOrderEmails, setOrderCustomerReference } from '@/modules/shop/lib/db/orders'
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

  const [items, notes, emails, refunds, refundItems, downloads, customer, config] = await Promise.all([
    getOrderItems(id),
    listOrderNotes(id),
    listOrderEmails(id),
    listRefundsForOrder(id),
    listRefundItemsForOrder(id),
    listDownloadsForOrder(id),
    getCustomerSummary(order.customerEmail),
    getShopConfigCached(),
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

  // What this shop calls the customer's own reference. Sent with the order so
  // the screen labels the box the way the checkout does, rather than the admin
  // and the storefront each having a name of their own for the same field.
  const customerReferenceLabel = config.customerReferenceLabel.trim() || 'Purchase order number'

  return NextResponse.json({ order, items, notes, emails, refunds, refundItems, downloads, customer, authors, customerReferenceLabel })
}

const PatchBody = z.object({
  // The customer's own reference for the order - their purchase order number.
  // Blank clears it, which is how a number typed into the wrong order is undone.
  customerReference: z.string().max(120),
})

// PATCH - the few things about an order somebody rings up to correct.
//
// Only the customer's own reference so far, and deliberately narrow: an order's
// figures, lines and addresses are what the shopper agreed to, and a route that
// would quietly rewrite them is not a route this screen needs.
//
// Gated on shop.orders WITHOUT allowAccess, unlike the GET above: read-only shop
// access is enough to look at an order and not enough to change one.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const parsed = PatchBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })

  const updated = await setOrderCustomerReference(id, parsed.data.customerReference)
  if (!updated) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const order = await getOrderById(id)
  return NextResponse.json({ order })
}
