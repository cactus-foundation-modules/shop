import { NextRequest, NextResponse } from 'next/server'
import { verifyInternalExportBearer } from '@/lib/members/export'
import { listOrdersByMemberId, getOrderItems } from '@/modules/shop/lib/db/orders'
import { listSavedAddresses } from '@/modules/shop/lib/db/addresses'
import { prisma } from '@/lib/db/prisma'

// Internal bearer only - called self-origin by core's assembleMemberExport(),
// never reachable with a browser session (memberExtensions.dataExportPath).
export async function GET(request: NextRequest) {
  if (!verifyInternalExportBearer(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const memberId = request.headers.get('x-cactus-member-id')
  if (!memberId) return NextResponse.json({ error: 'Missing member id' }, { status: 400 })

  const orders = await listOrdersByMemberId(memberId)
  const ordersWithItems = await Promise.all(orders.map(async (order) => ({ order, items: await getOrderItems(order.id) })))
  const addresses = await listSavedAddresses(memberId)
  const subscriptions = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_back_in_stock_subscriptions" WHERE "member_id" = ${memberId}`

  return NextResponse.json({ orders: ordersWithItems, addresses, backInStockSubscriptions: subscriptions })
}
