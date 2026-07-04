import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireShopUser } from '@/modules/shop/lib/access'

// Per tax-class/zone breakdown + CSV export (spec 8.3 GET /admin/reports/tax).
export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.reports')
  if (gate.error) return gate.error

  const rows = await prisma.$queryRaw<Array<{ tax_rate: string; order_count: bigint; tax_collected: string }>>`
    SELECT oi."tax_rate", COUNT(DISTINCT o."id")::bigint AS order_count, SUM(oi."tax_amount") AS tax_collected
    FROM "shp_order_items" oi
    JOIN "shp_orders" o ON o."id" = oi."order_id"
    WHERE o."payment_status" = 'PAID'
    GROUP BY oi."tax_rate"
    ORDER BY oi."tax_rate" DESC
  `
  const report = rows.map((r) => ({ taxRate: r.tax_rate, orderCount: Number(r.order_count), taxCollected: r.tax_collected }))

  if (request.nextUrl.searchParams.get('format') === 'csv') {
    const csv = ['tax_rate,order_count,tax_collected', ...report.map((r) => `${r.taxRate},${r.orderCount},${r.taxCollected}`)].join('\n')
    return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="tax-report.csv"' } })
  }

  return NextResponse.json({ report })
}
