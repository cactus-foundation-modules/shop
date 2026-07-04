import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { requireShopUser } from '@/modules/shop/lib/access'

// Aggregated from orders by email (spec 8.3) - there's no shp_customers table,
// customers are derived from shp_orders.
export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.customers', { allowAccess: true })
  if (gate.error) return gate.error

  const search = request.nextUrl.searchParams.get('search')
  const where = search
    ? Prisma.sql`WHERE "customer_email" ILIKE ${`%${search}%`} OR "customer_name" ILIKE ${`%${search}%`}`
    : Prisma.empty

  const rows = await prisma.$queryRaw<Array<{ customer_email: string; customer_name: string; member_id: string | null; order_count: bigint; total_spent: string }>>`
    SELECT "customer_email", MAX("customer_name") AS customer_name, MAX("member_id") AS member_id,
      COUNT(*)::bigint AS order_count, COALESCE(SUM("total") FILTER (WHERE "payment_status" = 'PAID'), 0) AS total_spent
    FROM "shp_orders"
    ${where}
    GROUP BY "customer_email"
    ORDER BY total_spent DESC
    LIMIT 100
  `

  return NextResponse.json({
    customers: rows.map((r) => ({
      email: r.customer_email,
      name: r.customer_name,
      memberId: r.member_id,
      orderCount: Number(r.order_count),
      totalSpent: r.total_spent,
    })),
  })
}
