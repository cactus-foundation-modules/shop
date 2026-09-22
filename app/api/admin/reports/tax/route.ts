import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { requireShopUser } from '@/modules/shop/lib/access'
import { instantAtWallClock } from '@/lib/config/timezone'
import { getSiteTimezone } from '@/lib/config/timezone.server'

// A yyyy-mm-dd from the query string, or null. Anything unparseable is treated
// as absent rather than as an error: a report is not worth 400ing over, and the
// unbounded report is the honest fallback.
//
// The day starts at midnight where the shop is, not midnight UTC: a VAT quarter
// ending 30 June ends at midnight in Britain, and read as UTC every summer
// quarter began and ended an hour late - a sale at half past midnight on 1 July
// landed in June's return.
function parseDate(raw: string | null, timezone: string): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const check = new Date(`${raw}T00:00:00.000Z`)
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== raw) return null
  return instantAtWallClock(raw, '00:00', timezone)
}

// The day after a yyyy-mm-dd, as a yyyy-mm-dd. Worked on the calendar rather
// than by adding 24 hours, because the day the clocks change is 23 or 25 long.
function nextDay(raw: string): string {
  const date = new Date(`${raw}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
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
  const timezone = await getSiteTimezone()
  const from = parseDate(params.get('from'), timezone)
  // Inclusive of the whole `to` day: an accountant asking for 30 June means the
  // end of 30 June, not midnight at the start of it.
  const toParam = params.get('to')
  const to = toParam && parseDate(toParam, timezone) ? parseDate(nextDay(toParam), timezone) : null

  // Each side of the report is dated by its own event, because a period is only
  // any use for a VAT return if what lands in it stays put once it is filed.
  //
  //  - Tax collected counts on the day the money came in (paid_at), not the day
  //    the basket was placed. For a card sale the two are minutes apart; for a
  //    bank transfer they can be days apart and a quarter end between them. An
  //    order from before paid_at was recorded falls back to its created_at.
  //  - Tax refunded counts on the day the refund was made, not the day its order
  //    was placed. Keyed off the order, a refund given in July for a June order
  //    went back and changed June's figure after June had been filed, and July's
  //    never showed it at all.
  const inPeriod = (column: Prisma.Sql) => Prisma.sql`
    ${from ? Prisma.sql`AND ${column} >= ${from}` : Prisma.empty}
    ${to ? Prisma.sql`AND ${column} < ${to}` : Prisma.empty}
  `
  const paidWhere = inPeriod(Prisma.sql`COALESCE(o."paid_at", o."created_at")`)
  const refundedWhere = inPeriod(Prisma.sql`r."created_at"`)

  const rows = await prisma.$queryRaw<Array<{ tax_rate: string; order_count: bigint; tax_collected: string }>>`
    SELECT oi."tax_rate", COUNT(DISTINCT o."id")::bigint AS order_count, SUM(oi."tax_amount") AS tax_collected
    FROM "shp_order_items" oi
    JOIN "shp_orders" o ON o."id" = oi."order_id"
    -- Every paid state: a refund now moves payment_status on from PAID
    -- (lib/payment-taken.ts), and a part-refunded sale still collected its tax.
    -- What went back is netted off below, from the refunds themselves.
    WHERE o."payment_status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') ${paidWhere}
    GROUP BY oi."tax_rate"
    ORDER BY oi."tax_rate" DESC
  `

  // Tax given back, by the rate of the line it was given back on.
  //
  // A refund line records only how much money went back (shp_refund_items has
  // no tax column), so the tax inside it is worked out from the ORIGINAL line's
  // own share of tax - its tax_amount over what the customer paid for it.
  // Deriving it that way rather than by re-applying tax_rate is deliberate: it
  // is the rate the line was actually sold at, whatever the table says now. A
  // zero-value line contributes nothing rather than dividing by zero.
  //
  // "What the customer paid" is the one place the ORDER's tax mode matters. A
  // refund is money handed back, tax and all, on either kind of shop (the refund
  // caps and the credit note both read it that way). On an inclusive order the
  // line's total already carries the tax; on an exclusive one it is the net
  // figure with the tax beside it, and dividing by that alone overstated every
  // refund's tax by the rate itself - a fifth too much at 20%, which the net
  // column then took off the tax owed.
  //
  // And the order's discount. A line's `total` is its price BEFORE any coupon,
  // while its `tax_amount` was worked out on what was left after it
  // (resolveOrderTotals) and a refund hands back the discounted figure too
  // (paidPerUnit). Dividing by the undiscounted total counted too little tax
  // back - a quarter too little on a 25% coupon - and overstated what was owed.
  const refundRows = await prisma.$queryRaw<Array<{ tax_rate: string; tax_refunded: string }>>`
    SELECT oi."tax_rate",
           SUM(ri."amount" * (oi."tax_amount" / NULLIF(
             oi."total" * (1 - LEAST(COALESCE(o."discount_amount" / NULLIF(o."subtotal", 0), 0), 1))
               + CASE WHEN o."tax_mode" = 'EXCLUSIVE' THEN oi."tax_amount" ELSE 0 END, 0
           ))) AS tax_refunded
    FROM "shp_refund_items" ri
    JOIN "shp_refunds" r ON r."id" = ri."refund_id"
    JOIN "shp_order_items" oi ON oi."id" = ri."order_item_id"
    JOIN "shp_orders" o ON o."id" = oi."order_id"
    WHERE o."payment_status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') ${refundedWhere}
    GROUP BY oi."tax_rate"
  `
  // Delivery carries VAT too (resolveOrderTotals), and it is not on any line:
  // it is whatever an order's tax_amount holds over and above its lines' own.
  // Left out, every order that charged delivery under-reported the VAT the shop
  // collected on it. It is split across the order's rates in proportion to the
  // tax on the goods at each - which is exactly how the invoice splits it
  // (deliverySlices in lib/invoice-tax.ts), so the report and the paperwork
  // agree. Refunded delivery (shp_refunds.shipping_amount, tax and all) is
  // split the same way, its tax in the proportion the delivery charge carried.
  const deliveryCollectedRows = await prisma.$queryRaw<Array<{ tax_rate: string; delivery_tax: string }>>`
    WITH paid AS (
      SELECT o."id", o."tax_amount", o."shipping_amount"
      FROM "shp_orders" o
      WHERE o."payment_status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') AND o."shipping_amount" > 0 ${paidWhere}
    ),
    per_rate AS (
      SELECT oi."order_id", oi."tax_rate", SUM(oi."tax_amount") AS goods_tax
      FROM "shp_order_items" oi JOIN paid ON paid."id" = oi."order_id"
      GROUP BY oi."order_id", oi."tax_rate"
    ),
    per_order AS (
      SELECT "order_id", SUM(goods_tax) AS goods_tax_total FROM per_rate GROUP BY "order_id"
    )
    SELECT pr."tax_rate",
           SUM(GREATEST(p."tax_amount" - po.goods_tax_total, 0) * pr.goods_tax / po.goods_tax_total) AS delivery_tax
    FROM per_rate pr
    JOIN per_order po ON po."order_id" = pr."order_id"
    JOIN paid p ON p."id" = pr."order_id"
    WHERE po.goods_tax_total > 0
    GROUP BY pr."tax_rate"
  `
  const deliveryRefundedRows = await prisma.$queryRaw<Array<{ tax_rate: string; delivery_tax: string }>>`
    WITH back AS (
      SELECT r."order_id", SUM(r."shipping_amount") AS shipping_back
      FROM "shp_refunds" r
      JOIN "shp_orders" o ON o."id" = r."order_id"
      WHERE r."status" = 'COMPLETED' AND r."shipping_amount" > 0
        AND o."payment_status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') ${refundedWhere}
      GROUP BY r."order_id"
    ),
    per_rate AS (
      SELECT oi."order_id", oi."tax_rate", SUM(oi."tax_amount") AS goods_tax
      FROM "shp_order_items" oi JOIN back ON back."order_id" = oi."order_id"
      GROUP BY oi."order_id", oi."tax_rate"
    ),
    per_order AS (
      SELECT "order_id", SUM(goods_tax) AS goods_tax_total FROM per_rate GROUP BY "order_id"
    ),
    delivery AS (
      SELECT o."id" AS order_id,
             GREATEST(o."tax_amount" - po.goods_tax_total, 0) AS delivery_tax,
             o."shipping_amount" + CASE WHEN o."tax_mode" = 'EXCLUSIVE' THEN GREATEST(o."tax_amount" - po.goods_tax_total, 0) ELSE 0 END AS delivery_gross
      FROM "shp_orders" o JOIN per_order po ON po."order_id" = o."id"
      WHERE o."shipping_amount" > 0
    )
    SELECT pr."tax_rate",
           SUM(LEAST(b.shipping_back, d.delivery_gross) * d.delivery_tax / d.delivery_gross * pr.goods_tax / po.goods_tax_total) AS delivery_tax
    FROM per_rate pr
    JOIN per_order po ON po."order_id" = pr."order_id"
    JOIN back b ON b."order_id" = pr."order_id"
    JOIN delivery d ON d.order_id = pr."order_id"
    WHERE po.goods_tax_total > 0 AND d.delivery_gross > 0
    GROUP BY pr."tax_rate"
  `

  const add = (into: Map<string, number>, key: string, amount: number) => into.set(key, (into.get(key) ?? 0) + amount)
  const collectedByRate = new Map<string, number>()
  const refundedByRate = new Map<string, number>()
  const ordersByRate = new Map<string, number>()
  for (const r of rows) {
    add(collectedByRate, String(r.tax_rate), Number(r.tax_collected ?? 0))
    ordersByRate.set(String(r.tax_rate), Number(r.order_count))
  }
  for (const r of deliveryCollectedRows) add(collectedByRate, String(r.tax_rate), Number(r.delivery_tax ?? 0))
  for (const r of refundRows) add(refundedByRate, String(r.tax_rate), Number(r.tax_refunded ?? 0))
  for (const r of deliveryRefundedRows) add(refundedByRate, String(r.tax_rate), Number(r.delivery_tax ?? 0))

  // Now the two sides are dated separately, a rate can have refunds in a period
  // and no sales in it - a July refund on a June sale, at a rate nothing sold at
  // in July. It still gets a row, or that refund goes missing from the one
  // period it belongs to.
  const rates = [...new Set([...collectedByRate.keys(), ...refundedByRate.keys()])].sort((a, b) => Number(b) - Number(a))
  const report = rates.map((taxRate) => {
    const collected = collectedByRate.get(taxRate) ?? 0
    const refunded = refundedByRate.get(taxRate) ?? 0
    return {
      taxRate,
      orderCount: ordersByRate.get(taxRate) ?? 0,
      taxCollected: collected.toFixed(2),
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
    const period = from || to ? `-${params.get('from') ?? 'start'}-to-${params.get('to') ?? 'now'}` : ''
    return new NextResponse(csv, {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="tax-report${period}.csv"` },
    })
  }

  return NextResponse.json({ report, from: params.get('from') ?? null, to: params.get('to') ?? null })
}
