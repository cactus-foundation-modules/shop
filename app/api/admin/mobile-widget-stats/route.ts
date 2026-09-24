import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireShopUser } from '@/modules/shop/lib/access'
import { summariseRevenue, type RevenueSummaryRow } from '@/modules/shop/lib/dashboard-revenue'

// All-time paid revenue and sale order count for the Deskwell iOS shop widget.
// Payment rules match dashboard-widget (migration 052 / payment-taken).
export async function GET() {
  const gate = await requireShopUser('shop.access', { allowAccess: true })
  if (gate.error) return gate.error

  const summaryRows = await prisma.$queryRaw<RevenueSummaryRow[]>`
    SELECT SUM("total") AS revenue,
           SUM("total") FILTER (WHERE "kind" = 'SALE') AS sale_revenue,
           COUNT(*) FILTER (WHERE "kind" = 'SALE')::bigint AS order_count
    FROM "shp_orders"
    WHERE "payment_status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
  `

  const summary = summariseRevenue(summaryRows[0])

  return NextResponse.json({
    revenueToDate: Number(summary.revenue),
    ordersToDate: summary.orderCount,
  })
}
