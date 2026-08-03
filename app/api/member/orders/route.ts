import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getMemberFromCookie } from '@/lib/members/session'
import { listOrdersForMember } from '@/modules/shop/lib/member-orders'

export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return errorResponse('Not authenticated', 401)
  const orders = await listOrdersForMember(member)
  return NextResponse.json({ orders })
}
