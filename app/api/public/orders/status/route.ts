import { NextRequest, NextResponse } from 'next/server'
import { getOrderByNumberAndEmail, getOrderItems } from '@/modules/shop/lib/db/orders'

// Guest order lookup: order number + email must both match - no enumeration (spec 8.1).
export async function GET(request: NextRequest) {
  const orderNumber = request.nextUrl.searchParams.get('orderNumber')
  const email = request.nextUrl.searchParams.get('email')
  if (!orderNumber || !email) return NextResponse.json({ error: 'orderNumber and email are required' }, { status: 400 })

  const order = await getOrderByNumberAndEmail(orderNumber, email)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const items = await getOrderItems(order.id)
  return NextResponse.json({ order, items })
}
