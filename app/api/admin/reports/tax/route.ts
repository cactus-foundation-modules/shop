import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { requireShopUser } from '@/modules/shop/lib/access'

// A yyyy-mm-dd from the query string, or null. Anything unparseable is treated
// as absent rather than as an error: a report is not worth 400ing over, and the
// unbounded report is the honest fallback.
function parseDate(raw: string | null): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const date = new Date(`${raw}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

// Per tax-class/zone breakdown + CSV export (spec 8.3 GET /admin/reports/tax).
//
// Two things this report used to get wrong, both of which matter because the
// only reason to open it is to fill in a VAT return:
//
//  - It had no date range at all. Every figure was all-time, so it could not
//    answer "what did I collect last quarter", which is the entire question.
//    `from` and `to` are optional and yyyy-mm-dd; leaving both off gives the
//    all-time figures it always gave.
//  - It counted refunded tax as collected. Money handed back is not tax owed,
//    so a quarter with a large return overstated the bill. Refunds are netted
//    off per rate now, and reported alongside so the arithmetic is visible
//    rather than something the reader has to take on trust.
export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.reports')
  if (gate.error) return gate.error

  const params = request.nextUrl.searchParams
  const from = parseDate(params.get('from'))
  // Inclusive of the whole `to` day: an accountant asking for 30 June means the
  // end of 30 June, not midnight at the start of it.
  const toRaw = parseDate(params.get('to'))
  const to = toRaw ? new Date(toRaw.getTime() + 24 * 60 * 60 * 1000) : null

  const dateWhere = Prisma.sql`
    ${from ? Prisma.sql`AND o."created_at" >= ${from}` : Prisma.empty}
    ${to ? Prisma.sql`AND o."created_at" < ${to}` : Prisma.empty}
  `

  const rows = await prisma.$queryRaw<Array<{ tax_rate: string; order_count: bigint; tax_collected: string }>>`
    SELECT oi."tax_rate", COUNT(DISTINCT o."id")::bigint AS order_count, SUM(oi."tax_amount") AS tax_collected
    FROM "shp_order_items" oi
    JOIN "shp_orders" o ON o."id" = oi."order_id"
    WHERE o."payment_status" = 'PAID' ${dateWhere}
    GROUP BY oi."tax_rate"
    ORDER BY oi."tax_rate" DESC
  `

  // Tax given back, by the rate of the line it was given back on.
  //
  // A refund line records only how much money went back (shp_refund_items has
  // no tax column), so the tax inside it is worked out from the ORIGINAL line's
  // own effective tax fraction - its tax_amount over its total. Deriving it that
  // way rather than by re-applying tax_rate is deliberate: the fraction is
  // already whichever of inclusive or exclusive that order was taken under, so
  // this needs no opinion about the shop's tax mode then or now. A zero-value
  // line contributes nothing rather than dividing by zero.
  const refundRows = await prisma.$queryRaw<Array<{ tax_rate: string; tax_refunded: string }>>`
    SELECT oi."tax_rate",
           SUM(ri."amount" * (oi."tax_amount" / NULLIF(oi."total", 0))) AS tax_refunded
    FROM "shp_refund_items" ri
    JOIN "shp_refunds" r ON r."id" = ri."refund_id"
    JOIN "shp_order_items" oi ON oi."id" = ri."order_item_id"
    JOIN "shp_orders" o ON o."id" = oi."order_id"
    WHERE o."payment_status" = 'PAID' ${dateWhere}
    GROUP BY oi."tax_rate"
  `
  const refundedByRate = new Map(refundRows.map((r) => [String(r.tax_rate), Number(r.tax_refunded ?? 0)]))

  const report = rows.map((r) => {
    const collected = Number(r.tax_collected ?? 0)
    const refunded = refundedByRate.get(String(r.tax_rate)) ?? 0
    return {
      taxRate: r.tax_rate,
      orderCount: Number(r.order_count),
      taxCollected: r.tax_collected,
      taxRefunded: refunded.toFixed(2),
      // What is actually owed on this rate for the period.
      taxNet: (collected - refunded).toFixed(2),
    }
  })

  if (params.get('format') === 'csv') {
    const csv = [
      'tax_rate,order_count,tax_collected,tax_refunded,tax_net',
      ...report.map((r) => `${r.taxRate},${r.orderCount},${r.taxCollected},${r.taxRefunded},${r.taxNet}`),
    ].join('\n')
    const period = from || toRaw ? `-${params.get('from') ?? 'start'}-to-${params.get('to') ?? 'now'}` : ''
    return new NextResponse(csv, {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="tax-report${period}.csv"` },
    })
  }

  return NextResponse.json({ report, from: params.get('from') ?? null, to: params.get('to') ?? null })
}
