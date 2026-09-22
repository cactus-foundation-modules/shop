import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireShopUser } from '@/modules/shop/lib/access'
import { summariseRevenue, type RevenueSummaryRow } from '@/modules/shop/lib/dashboard-revenue'

// Backs ShopDashboardWidget.tsx (spec 8.3, section 11): 30-day revenue/orders/AOV,
// low-stock count, pending manual-payment count, active pre-order count.
export async function GET() {
  const gate = await requireShopUser('shop.access', { allowAccess: true })
  if (gate.error) return gate.error

  const [summaryRows, lowStockRows, pendingManualRows, preOrderRows] = await Promise.all([
    prisma.$queryRaw<RevenueSummaryRow[]>`
      -- Counts follow kind, money follows payment_status (migration 052). A
      -- replacement part is settled the moment it is raised and adds nothing to
      -- the revenue; without the filter it would still read as another sale.
      -- sale_revenue is for the average, which is sales' money over sales -
      -- see lib/dashboard-revenue.ts. Every paid state counts, refunded ones
      -- included, as while a refund left payment_status at PAID
      -- (lib/payment-taken.ts).
      SELECT SUM("total") AS revenue,
             SUM("total") FILTER (WHERE "kind" = 'SALE') AS sale_revenue,
             COUNT(*) FILTER (WHERE "kind" = 'SALE')::bigint AS order_count
      FROM "shp_orders"
      WHERE "payment_status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') AND "created_at" > NOW() - interval '30 days'
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "shp_products"
      WHERE "track_inventory" = true AND "low_stock_threshold" IS NOT NULL AND "stock_count" <= "low_stock_threshold"
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "shp_orders"
      -- COALESCE, not payment_method alone: a customer who started a card
      -- payment from their own order page and thought better of it has moved
      -- payment_method on, while the transfer this queue is about is still owed.
      WHERE COALESCE("original_payment_method", "payment_method") IN ('BANK_TRANSFER', 'CASH')
        AND "payment_status" = 'AWAITING_CONFIRMATION'
    `,
    prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "shp_products" WHERE "is_pre_order" = true`,
  ])

  const summary = summariseRevenue(summaryRows[0])

  return NextResponse.json({
    // Still numbers, as this route has always answered with - but numbers made
    // from the two-decimal strings, so the division happened in Decimal and
    // nothing here can be a fraction of a penny out.
    revenue30d: Number(summary.revenue),
    orders30d: summary.orderCount,
    averageOrderValue30d: Number(summary.averageOrderValue),
    lowStockCount: Number(lowStockRows[0]?.count ?? 0),
    pendingManualPaymentCount: Number(pendingManualRows[0]?.count ?? 0),
    activePreOrderCount: Number(preOrderRows[0]?.count ?? 0),
  })
}
