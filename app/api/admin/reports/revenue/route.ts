import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireShopUser } from '@/modules/shop/lib/access'

export async function GET() {
  const gate = await requireShopUser('shop.reports')
  if (gate.error) return gate.error

  const rows = await prisma.$queryRaw<Array<{ day: Date; revenue: string; order_count: bigint }>>`
    -- Counts follow kind, money follows payment_status (migration 052). Every
    -- paid state counts, refunded ones included, as while a refund left
    -- payment_status at PAID (lib/payment-taken.ts).
    SELECT date_trunc('day', "created_at") AS day, SUM("total") AS revenue,
           COUNT(*) FILTER (WHERE "kind" = 'SALE')::bigint AS order_count
    FROM "shp_orders" WHERE "payment_status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') AND "created_at" > NOW() - interval '90 days'
    GROUP BY day ORDER BY day ASC
  `
  return NextResponse.json({
    days: rows.map((r) => ({ day: r.day, revenue: r.revenue, orderCount: Number(r.order_count) })),
  })
}
