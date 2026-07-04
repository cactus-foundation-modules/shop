import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getMemberFromCookie } from '@/lib/members/session'
import { listOrdersByMemberId } from '@/modules/shop/lib/db/orders'

export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return errorResponse('Not authenticated', 401)
  const orders = await listOrdersByMemberId(member.id)
  return NextResponse.json({ orders })
}
