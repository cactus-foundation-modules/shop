import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { syncSupplierNavEntry } from '@/modules/shop/lib/supplier-nav'

// Backs ShopDashboardWidget.tsx (spec 8.3, section 11): 30-day revenue/orders/AOV,
// low-stock count, pending manual-payment count, active pre-order count.
export async function GET() {
  const gate = await requireShopUser('shop.access', { allowAccess: true })
  if (gate.error) return gate.error

  // The admin dashboard is the page an owner lands on most, which makes this the
  // quickest place for the Suppliers sidebar link to heal itself after a module
  // update has reset the stored manifest - see supplier-nav.ts. It no-ops (one
  // indexed read, no write) whenever the link already matches the setting.
  await syncSupplierNavEntry((await getShopConfigCached()).supplierFieldEnabled)

  const [summaryRows, lowStockRows, pendingManualRows, preOrderRows] = await Promise.all([
    prisma.$queryRaw<Array<{ revenue: string | null; order_count: bigint }>>`
      SELECT SUM("total") AS revenue, COUNT(*)::bigint AS order_count FROM "shp_orders"
      WHERE "payment_status" = 'PAID' AND "created_at" > NOW() - interval '30 days'
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "shp_products"
      WHERE "track_inventory" = true AND "low_stock_threshold" IS NOT NULL AND "stock_count" <= "low_stock_threshold"
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "shp_orders"
      WHERE "payment_method" IN ('BANK_TRANSFER', 'CASH') AND "payment_status" = 'AWAITING_CONFIRMATION'
    `,
    prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "shp_products" WHERE "is_pre_order" = true`,
  ])

  const summary = summaryRows[0]
  const revenue = Number(summary?.revenue ?? 0)
  const orderCount = Number(summary?.order_count ?? 0)

  return NextResponse.json({
    revenue30d: revenue,
    orders30d: orderCount,
    averageOrderValue30d: orderCount > 0 ? revenue / orderCount : 0,
    lowStockCount: Number(lowStockRows[0]?.count ?? 0),
    pendingManualPaymentCount: Number(pendingManualRows[0]?.count ?? 0),
    activePreOrderCount: Number(preOrderRows[0]?.count ?? 0),
  })
}
