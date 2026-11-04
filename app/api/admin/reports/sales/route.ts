import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getSiteTimezone } from '@/lib/config/timezone.server'
import { bucketsBetween, readPeriod } from '@/modules/shop/lib/reports/period'

// Everything Reports > Sales, Products and Customers draw, for one period, in
// one round trip: the headline figures against the period before, the trend in
// buckets, the mix by payment method and status, when people buy, and the
// products and customers behind the money.
//
// The rules every figure here follows, so they agree with the Tax tab and with
// each other:
//  - A sale counts on the day it was paid for (paid_at, falling back to
//    created_at for orders from before it was recorded), in the site's timezone.
//  - Only sales (kind SALE) in a paid state, refunded ones included - what went
//    back is reported as refunds, on the day it went back, not by unpicking the
//    sale. A replacement order is free and has no money in it.
//  - "Net" is what the customer paid less the tax in it, on either tax mode:
//    total - tax_amount. Delivery is in it; tax is not.
//  - A refund's net is its share of the order's own net: amount x net / total.
//
// Filters: `method` and `status`, comma-separated, narrow the orders; both
// periods are narrowed the same way so the comparison stays like for like.

const PAID = Prisma.sql`('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')`
const LIST = /^[A-Z_]+(,[A-Z_]+)*$/

function listParam(raw: string | null): string[] {
  return raw && LIST.test(raw) ? raw.split(',').slice(0, 20) : []
}

const n = (v: unknown) => Number(v ?? 0)

export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.reports')
  if (gate.error) return gate.error

  const params = request.nextUrl.searchParams
  const timezone = await getSiteTimezone()
  const period = readPeriod(params, timezone)
  const methods = listParam(params.get('method'))
  const statuses = listParam(params.get('status'))

  const narrow = Prisma.sql`
    ${methods.length ? Prisma.sql`AND o."payment_method" IN (${Prisma.join(methods)})` : Prisma.empty}
    ${statuses.length ? Prisma.sql`AND o."status" IN (${Prisma.join(statuses)})` : Prisma.empty}
  `
  // Local wall-clock time of the sale. The columns are UTC without a zone.
  const localAt = Prisma.sql`((COALESCE(o."paid_at", o."created_at") AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})`
  const paidAt = Prisma.sql`COALESCE(o."paid_at", o."created_at")`
  const trunc = Prisma.raw(`'${period.grouping}'`)

  const base = Prisma.sql`
    SELECT o.*, ${localAt} AS local_at,
           CASE WHEN ${paidAt} >= ${period.from} THEN 'cur' ELSE 'prev' END AS period
    FROM "shp_orders" o
    WHERE o."kind" = 'SALE' AND o."payment_status" IN ${PAID}
      AND ${paidAt} >= ${period.previousFrom} AND ${paidAt} < ${period.to}
      ${narrow}
  `

  const [kpiRows, unitRows, refundRows, seriesRows, refundSeriesRows, methodRows, statusRows, heatRows, productRows, customerRows, newRows] = await Promise.all([
    prisma.$queryRaw<Array<{ period: string; orders: bigint; gross: string; net: string; tax: string; shipping: string; discount: string; customers: bigint }>>`
      WITH o AS (${base})
      SELECT period, COUNT(*)::bigint AS orders, SUM("total") AS gross, SUM("total" - "tax_amount") AS net,
             SUM("tax_amount") AS tax, SUM("shipping_amount") AS shipping, SUM("discount_amount") AS discount,
             COUNT(DISTINCT lower("customer_email"))::bigint AS customers
      FROM o GROUP BY period
    `,
    prisma.$queryRaw<Array<{ period: string; units: bigint }>>`
      WITH o AS (${base})
      SELECT o.period, COALESCE(SUM(oi."quantity"), 0)::bigint AS units
      FROM o JOIN "shp_order_items" oi ON oi."order_id" = o."id"
      GROUP BY o.period
    `,
    // Refunds by the day they were made, on orders the filters let through.
    prisma.$queryRaw<Array<{ period: string; refunds: string; refunds_net: string; count: bigint }>>`
      SELECT CASE WHEN r."created_at" >= ${period.from} THEN 'cur' ELSE 'prev' END AS period,
             SUM(r."amount") AS refunds,
             SUM(r."amount" * (o."total" - o."tax_amount") / NULLIF(o."total", 0)) AS refunds_net,
             COUNT(*)::bigint AS count
      FROM "shp_refunds" r JOIN "shp_orders" o ON o."id" = r."order_id"
      WHERE r."status" = 'COMPLETED' AND r."created_at" >= ${period.previousFrom} AND r."created_at" < ${period.to}
        AND o."kind" = 'SALE' ${narrow}
      GROUP BY 1
    `,
    prisma.$queryRaw<Array<{ period: string; bucket: string; orders: bigint; gross: string; net: string }>>`
      WITH o AS (${base})
      SELECT period, to_char(date_trunc(${trunc}, local_at), 'YYYY-MM-DD') AS bucket,
             COUNT(*)::bigint AS orders, SUM("total") AS gross, SUM("total" - "tax_amount") AS net
      FROM o GROUP BY 1, 2
    `,
    prisma.$queryRaw<Array<{ bucket: string; refunds: string }>>`
      SELECT to_char(date_trunc(${trunc}, ((r."created_at" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})), 'YYYY-MM-DD') AS bucket,
             SUM(r."amount") AS refunds
      FROM "shp_refunds" r JOIN "shp_orders" o ON o."id" = r."order_id"
      WHERE r."status" = 'COMPLETED' AND r."created_at" >= ${period.from} AND r."created_at" < ${period.to}
        AND o."kind" = 'SALE' ${narrow}
      GROUP BY 1
    `,
    prisma.$queryRaw<Array<{ key: string; orders: bigint; gross: string }>>`
      WITH o AS (${base})
      SELECT "payment_method" AS key, COUNT(*)::bigint AS orders, SUM("total") AS gross
      FROM o WHERE period = 'cur' GROUP BY 1 ORDER BY 3 DESC
    `,
    prisma.$queryRaw<Array<{ key: string; orders: bigint; gross: string }>>`
      WITH o AS (${base})
      SELECT "status" AS key, COUNT(*)::bigint AS orders, SUM("total") AS gross
      FROM o WHERE period = 'cur' GROUP BY 1 ORDER BY 2 DESC
    `,
    prisma.$queryRaw<Array<{ dow: number; hour: number; orders: bigint; gross: string }>>`
      WITH o AS (${base})
      SELECT EXTRACT(ISODOW FROM local_at)::int AS dow, EXTRACT(HOUR FROM local_at)::int AS hour,
             COUNT(*)::bigint AS orders, SUM("total") AS gross
      FROM o WHERE period = 'cur' GROUP BY 1, 2
    `,
    // A line's net after its share of the order's coupon - the same reading the
    // Tax tab takes of a discounted line. Exclusive totals are already net.
    prisma.$queryRaw<Array<{ product_id: string | null; name: string; sku: string | null; period: string; units: bigint; orders: bigint; net: string }>>`
      WITH o AS (${base})
      SELECT oi."product_id", MAX(oi."product_name") AS name, MAX(oi."product_sku") AS sku, o.period,
             SUM(oi."quantity")::bigint AS units, COUNT(DISTINCT o."id")::bigint AS orders,
             SUM((oi."total" - CASE WHEN o."tax_mode" = 'EXCLUSIVE' THEN 0 ELSE oi."tax_amount" END)
                 * (1 - LEAST(COALESCE(o."discount_amount" / NULLIF(o."subtotal", 0), 0), 1))) AS net
      FROM o JOIN "shp_order_items" oi ON oi."order_id" = o."id"
      GROUP BY oi."product_id", CASE WHEN oi."product_id" IS NULL THEN oi."product_name" END, o.period
    `,
    prisma.$queryRaw<Array<{ email: string; name: string; organisation: string | null; orders: bigint; gross: string; net: string; first_at: Date; last_at: Date; member: boolean }>>`
      WITH o AS (${base})
      SELECT lower("customer_email") AS email, MAX("customer_name") AS name, MAX("customer_organisation") AS organisation,
             COUNT(*)::bigint AS orders, SUM("total") AS gross, SUM("total" - "tax_amount") AS net,
             MIN(local_at) AS first_at, MAX(local_at) AS last_at, bool_or("member_id" IS NOT NULL) AS member
      FROM o WHERE period = 'cur' GROUP BY 1 ORDER BY net DESC LIMIT 500
    `,
    // Customers whose first paid sale ever falls in this period.
    prisma.$queryRaw<Array<{ email: string }>>`
      SELECT lower(o."customer_email") AS email
      FROM "shp_orders" o
      WHERE o."kind" = 'SALE' AND o."payment_status" IN ${PAID}
      GROUP BY 1
      HAVING MIN(${paidAt}) >= ${period.from} AND MIN(${paidAt}) < ${period.to}
    `,
  ])

  const pick = <T extends { period: string }>(rows: T[], p: 'cur' | 'prev') => rows.find((r) => r.period === p)
  const newSet = new Set(newRows.map((r) => r.email))

  const kpis = (p: 'cur' | 'prev') => {
    const k = pick(kpiRows, p)
    const r = pick(refundRows, p)
    const orders = Number(k?.orders ?? 0)
    const net = n(k?.net)
    return {
      orders,
      gross: n(k?.gross),
      net,
      tax: n(k?.tax),
      shipping: n(k?.shipping),
      discount: n(k?.discount),
      customers: Number(k?.customers ?? 0),
      units: Number(pick(unitRows, p)?.units ?? 0),
      refunds: n(r?.refunds),
      refundsNet: n(r?.refunds_net),
      refundCount: Number(r?.count ?? 0),
      aov: orders ? net / orders : 0,
    }
  }
  const current = kpis('cur')
  const customers = customerRows.map((c) => ({
    email: c.email,
    name: c.name,
    organisation: c.organisation,
    orders: Number(c.orders),
    gross: n(c.gross),
    net: n(c.net),
    firstAt: c.first_at,
    lastAt: c.last_at,
    member: c.member,
    isNew: newSet.has(c.email),
  }))
  const newCustomers = customers.filter((c) => c.isNew).length

  // Buckets, gaps filled, the period before laid against it slot for slot.
  const buckets = bucketsBetween(period.fromDay, period.toDay, period.grouping)
  const previousBuckets = bucketsBetween(period.previousFromDay, period.previousToDay, period.grouping)
  const at = (p: string, bucket: string) => seriesRows.find((r) => r.period === p && r.bucket === bucket)
  const series = buckets.map((bucket, i) => {
    const cur = at('cur', bucket)
    const prevBucket = previousBuckets[i]
    const prev = prevBucket ? at('prev', prevBucket) : undefined
    return {
      bucket,
      orders: Number(cur?.orders ?? 0),
      gross: n(cur?.gross),
      net: n(cur?.net),
      refunds: n(refundSeriesRows.find((r) => r.bucket === bucket)?.refunds),
      previousNet: prev ? n(prev.net) : null,
      previousOrders: prev ? Number(prev.orders) : null,
    }
  })

  // Products: this period's figures, with last period's net beside for the trend.
  const productKey = (r: { product_id: string | null; name: string }) => r.product_id ?? `name:${r.name}`
  const previousNetByProduct = new Map<string, number>()
  for (const r of productRows) if (r.period === 'prev') previousNetByProduct.set(productKey(r), n(r.net))
  const products = productRows
    .filter((r) => r.period === 'cur')
    .map((r) => ({
      id: r.product_id,
      name: r.name,
      sku: r.sku,
      units: Number(r.units),
      orders: Number(r.orders),
      net: n(r.net),
      previousNet: previousNetByProduct.get(productKey(r)) ?? 0,
    }))
    .sort((a, b) => b.net - a.net)
    .slice(0, 500)

  return NextResponse.json({
    period: {
      from: period.fromDay,
      to: period.toDay,
      previousFrom: period.previousFromDay,
      previousTo: period.previousToDay,
      days: period.days,
      grouping: period.grouping,
      timezone,
    },
    kpis: { current: { ...current, newCustomers, returningCustomers: current.customers - newCustomers }, previous: kpis('prev') },
    series,
    byMethod: methodRows.map((r) => ({ key: r.key, orders: Number(r.orders), gross: n(r.gross) })),
    byStatus: statusRows.map((r) => ({ key: r.key, orders: Number(r.orders), gross: n(r.gross) })),
    heatmap: heatRows.map((r) => ({ dow: r.dow, hour: r.hour, orders: Number(r.orders), gross: n(r.gross) })),
    products,
    customers,
  })
}
