import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById, confirmManualPayment } from '@/modules/shop/lib/db/orders'
import { fulfillPaidOrder } from '@/modules/shop/lib/order-fulfillment'

// Manually confirm bank transfer / cash payment once it clears (spec 8.3).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.paymentMethod !== 'BANK_TRANSFER' && order.paymentMethod !== 'CASH') {
    return NextResponse.json({ error: 'Only bank transfer and cash payments are confirmed manually' }, { status: 400 })
  }
  if (order.paymentStatus === 'PAID') return NextResponse.json({ success: true })

  await confirmManualPayment(id)
  await fulfillPaidOrder(id)
  return NextResponse.json({ success: true })
}
