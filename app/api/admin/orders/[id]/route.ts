import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById, getOrderItems, listOrderNotes, listOrderEmails } from '@/modules/shop/lib/db/orders'
import { listRefundsForOrder } from '@/modules/shop/lib/db/refunds'
import { listDownloadsForOrder } from '@/modules/shop/lib/db/digital'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const [items, notes, emails, refunds, downloads] = await Promise.all([
    getOrderItems(id), listOrderNotes(id), listOrderEmails(id), listRefundsForOrder(id), listDownloadsForOrder(id),
  ])
  return NextResponse.json({ order, items, notes, emails, refunds, downloads })
}
