import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById, getOrderItemById, getOrderItems, updateOrderStatus } from '@/modules/shop/lib/db/orders'
import { createRefund, listRefundsForOrder } from '@/modules/shop/lib/db/refunds'
import { paymentProviders } from '@/modules/shop/lib/payments/registry'

const Body = z.object({
  reason: z.string().nullable().optional(),
  items: z.array(z.object({ orderItemId: z.string(), quantity: z.number().int().min(1), amount: z.number().nonnegative() })).min(1),
})

// PROTECTED - per-item refund: validates quantities against refundedQty,
// calls the order's provider refundOrder, records shp_refunds/shp_refund_items.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (!order.paymentReference && (order.paymentMethod === 'STRIPE' || order.paymentMethod === 'PAYPAL')) {
    return NextResponse.json({ error: 'Order has no payment reference to refund against' }, { status: 400 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid refund' }, { status: 400 })

  for (const item of parsed.data.items) {
    const orderItem = await getOrderItemById(item.orderItemId)
    if (!orderItem || orderItem.orderId !== id) return NextResponse.json({ error: 'Order item not found' }, { status: 404 })
    if (orderItem.refundedQty + item.quantity > orderItem.quantity) {
      return NextResponse.json({ error: `Cannot refund more than the ${orderItem.quantity} units purchased for ${orderItem.productName}` }, { status: 400 })
    }
    // Money cap: the requested amount can't exceed this line's tax-inclusive
    // value for the units being refunded (a quantity cap alone let an operator
    // refund an arbitrary amount against a cheap line).
    const perUnit = orderItem.quantity > 0 ? Number(orderItem.total) / orderItem.quantity : Number(orderItem.unitPrice)
    const maxLineRefund = perUnit * item.quantity + 0.01 // penny tolerance for rounding
    if (item.amount > maxLineRefund) {
      return NextResponse.json({ error: `Refund amount for ${orderItem.productName} exceeds the value of the units being refunded` }, { status: 400 })
    }
  }

  const totalAmount = parsed.data.items.reduce((sum, i) => sum + i.amount, 0)

  // Cumulative cap: prior completed refunds plus this one must not exceed the
  // order total, so a run of partial refunds can't sum past what was charged.
  const alreadyRefunded = (await listRefundsForOrder(id))
    .filter((r) => r.status === 'COMPLETED')
    .reduce((sum, r) => sum + Number(r.amount), 0)
  if (alreadyRefunded + totalAmount > Number(order.total) + 0.01) {
    return NextResponse.json({ error: 'This refund would exceed the amount paid for the order.' }, { status: 400 })
  }

  const provider = paymentProviders[order.paymentMethod]
  const result = await provider.refundOrder({
    providerReference: order.paymentReference ?? '',
    amount: totalAmount,
    currency: order.currency,
    items: parsed.data.items.map((i) => ({ name: i.orderItemId, quantity: i.quantity, amount: i.amount })),
  })

  const { id: refundId } = await createRefund({
    orderId: id,
    amount: totalAmount,
    reason: parsed.data.reason ?? null,
    providerRefundId: result.providerRefundId ?? null,
    status: result.success ? 'COMPLETED' : 'FAILED',
    createdBy: gate.user.id,
    items: parsed.data.items,
  })

  if (result.success) {
    // createRefund already incremented refundedQty on each order item - re-fetch
    // every item on the order (not just the ones in this request) to decide
    // full vs. partial.
    const allItems = await getOrderItems(id)
    const fullyRefunded = allItems.every((i) => i.refundedQty >= i.quantity)
    await updateOrderStatus(id, fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED')
  }

  return NextResponse.json({ refundId, success: result.success, error: result.error }, { status: result.success ? 201 : 502 })
}
