import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getMemberFromCookie } from '@/lib/members/session'
import { getOrderById, getOrderItems } from '@/modules/shop/lib/db/orders'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMemberFromCookie()
  if (!member) return errorResponse('Not authenticated', 401)

  const { id } = await params
  const order = await getOrderById(id)
  if (!order || order.memberId !== member.id) return errorResponse('Order not found', 404)

  const items = await getOrderItems(order.id)
  return NextResponse.json({ order, items })
}
