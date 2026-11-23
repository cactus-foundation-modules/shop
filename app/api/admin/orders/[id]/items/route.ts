import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById, getOrderItems } from '@/modules/shop/lib/db/orders'
import type { OrderItemsPreviewLine } from '@/modules/shop/lib/order-items-preview'

// Just the lines of one order, for the products pop-up on the orders list. The
// order's own GET carries notes, emails, refunds, the customer's history and
// more besides - a dozen reads to answer "what was in it?" from a list row.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const items = await getOrderItems(id)
  const lines: OrderItemsPreviewLine[] = items.map((item) => ({
    id: item.id,
    productName: item.productName,
    productSku: item.productSku,
    quantity: item.quantity,
    refundedQty: item.refundedQty,
    total: item.total,
    isPreOrder: item.isPreOrder,
    options: (item.lineMeta?.fields ?? []).map((f) => ({ label: f.label, value: f.value })),
  }))

  return NextResponse.json({ orderNumber: order.orderNumber, lines })
}
