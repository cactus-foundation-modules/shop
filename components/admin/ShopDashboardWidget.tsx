import { headers } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { getShopConfigCached } from '@/modules/shop/lib/config'

// Contributed to the core `core.admin-dashboard-widgets` extension point
// (spec section 11): 30-day revenue/orders/AOV, low-stock count, pending
// manual-payment count, active pre-order chip.
export async function shopDashboardWidget() {
  const adminPath = (await headers()).get('x-cactus-admin-path') ?? ''
  const config = await getShopConfigCached()

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

  const revenue = Number(summaryRows[0]?.revenue ?? 0)
  const orderCount = Number(summaryRows[0]?.order_count ?? 0)
  const aov = orderCount > 0 ? revenue / orderCount : 0
  const lowStockCount = Number(lowStockRows[0]?.count ?? 0)
  const pendingManualCount = Number(pendingManualRows[0]?.count ?? 0)
  const preOrderCount = Number(preOrderRows[0]?.count ?? 0)

  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <h2 className="card-title" style={{ margin: '0 0 0.75rem' }}>Shop</h2>
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <div><div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{config.currencySymbol}{revenue.toFixed(2)}</div><div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Revenue (30d)</div></div>
        <div><div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{orderCount}</div><div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Orders (30d)</div></div>
        <div><div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{config.currencySymbol}{aov.toFixed(2)}</div><div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Avg order value</div></div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {lowStockCount > 0 && (
          <a href={`/${adminPath}/m/shop/products?lowStock=true`} style={{ fontSize: '0.8125rem', background: 'var(--color-surface-muted)', borderRadius: 999, padding: '0.25rem 0.625rem', textDecoration: 'none', color: 'var(--color-text)' }}>
            {lowStockCount} low stock
          </a>
        )}
        {pendingManualCount > 0 && (
          <a href={`/${adminPath}/m/shop/orders?paymentStatus=AWAITING_CONFIRMATION`} style={{ fontSize: '0.8125rem', background: 'var(--color-surface-muted)', borderRadius: 999, padding: '0.25rem 0.625rem', textDecoration: 'none', color: 'var(--color-text)' }}>
            {pendingManualCount} awaiting payment confirmation
          </a>
        )}
        {preOrderCount > 0 && (
          <a href={`/${adminPath}/m/shop/orders?preOrder=true`} style={{ fontSize: '0.8125rem', background: 'var(--color-surface-muted)', borderRadius: 999, padding: '0.25rem 0.625rem', textDecoration: 'none', color: 'var(--color-text)' }}>
            {preOrderCount} active pre-orders
          </a>
        )}
      </div>
      <a href={`/${adminPath}/m/shop/products`} style={{ fontSize: 'var(--text-sm)', color: 'var(--color-primary)', textDecoration: 'none' }}>Manage Shop →</a>
    </div>
  )
}
