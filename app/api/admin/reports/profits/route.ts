import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getSiteTimezone } from '@/lib/config/timezone.server'
import { readPeriod } from '@/modules/shop/lib/reports/period'
import { resolveOrderCosts, type ResolvedOrderCost } from '@/modules/shop/lib/order-costs'

// Reports > Profits: every sale paid for in the period, what it brought in, what
// it cost, and what was left.
//
//   income  = what the customer paid, less the tax in it (total - tax_amount),
//             plus any extra charge they paid on top later (a redelivery fee,
//             shp_order_charges PAID), net
//   refunds = every completed refund on the order, WHENEVER it was made, at its
//             share of the order's net - a per-order view asks "what did this
//             order make", and a refund next month is part of the answer
//   costs   = whatever the installed shop.order-costs providers say the order
//             cost, net (lib/order-costs.ts) - purchase orders, typically
//   profit  = income - refunds - costs
//
// The order is dated by when it was paid for, as on every other tab. Shop knows
// nothing about costs itself: on a site with no provider the tab says so, rather
// than reporting every order as pure profit.

const PAID = Prisma.sql`('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')`
const LIST = /^[A-Z_]+(,[A-Z_]+)*$/
const MAX_ORDERS = 5000

function listParam(raw: string | null): string[] {
  return raw && LIST.test(raw) ? raw.split(',').slice(0, 20) : []
}

const round = (v: number) => Math.round(v * 100) / 100

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value)
  // A leading = + - @ is a formula to a spreadsheet; a customer's name is not.
  const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export async function GET(request: NextRequest) {
  const gate = await requireShopUser('shop.reports')
  if (gate.error) return gate.error

  const params = request.nextUrl.searchParams
  const timezone = await getSiteTimezone()
  const period = readPeriod(params, timezone)
  const methods = listParam(params.get('method'))
  const statuses = listParam(params.get('status'))
  const paidAt = Prisma.sql`COALESCE(o."paid_at", o."created_at")`

  const rows = await prisma.$queryRaw<Array<{
    id: string; order_number: string; local_day: string; customer_name: string; customer_email: string
    customer_organisation: string | null; status: string; payment_status: string; payment_method: string
    total: string; tax_amount: string; shipping_amount: string; discount_amount: string
    units: bigint; charges_net: string | null; refunds: string | null
  }>>`
    SELECT o."id", o."order_number",
           to_char((${paidAt} AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}, 'YYYY-MM-DD"T"HH24:MI') AS local_day,
           o."customer_name", lower(o."customer_email") AS customer_email, o."customer_organisation",
           o."status", o."payment_status", o."payment_method",
           o."total", o."tax_amount", o."shipping_amount", o."discount_amount",
           (SELECT COALESCE(SUM(oi."quantity"), 0) FROM "shp_order_items" oi WHERE oi."order_id" = o."id")::bigint AS units,
           (SELECT SUM(c."net_amount") FROM "shp_order_charges" c WHERE c."order_id" = o."id" AND c."status" = 'PAID') AS charges_net,
           (SELECT SUM(r."amount") FROM "shp_refunds" r WHERE r."order_id" = o."id" AND r."status" = 'COMPLETED') AS refunds
    FROM "shp_orders" o
    WHERE o."kind" = 'SALE' AND o."payment_status" IN ${PAID}
      AND ${paidAt} >= ${period.from} AND ${paidAt} < ${period.to}
      ${methods.length ? Prisma.sql`AND o."payment_method" IN (${Prisma.join(methods)})` : Prisma.empty}
      ${statuses.length ? Prisma.sql`AND o."status" IN (${Prisma.join(statuses)})` : Prisma.empty}
    ORDER BY ${paidAt} DESC
    LIMIT ${MAX_ORDERS + 1}
  `
  const truncated = rows.length > MAX_ORDERS
  const orders = rows.slice(0, MAX_ORDERS)

  const { costs, providers, failed } = await resolveOrderCosts(orders.map((o) => ({ id: o.id, orderNumber: o.order_number })))

  const report = orders.map((o) => {
    const total = Number(o.total)
    const net = total - Number(o.tax_amount)
    const charges = Number(o.charges_net ?? 0)
    const refundsGross = Number(o.refunds ?? 0)
    const refundsNet = total > 0 ? refundsGross * (net / total) : 0
    const income = net + charges
    const list: ResolvedOrderCost[] = costs[o.id] ?? []
    const cost = list.reduce((sum, c) => sum + c.amount, 0)
    const profit = income - refundsNet - cost
    const kept = income - refundsNet
    const basis = list.length === 0 ? 'none' : list.every((c) => c.basis === 'billed') ? 'billed' : list.some((c) => c.basis === 'billed') ? 'mixed' : 'ordered'
    return {
      id: o.id,
      orderNumber: o.order_number,
      paidAt: o.local_day,
      customer: o.customer_name,
      email: o.customer_email,
      organisation: o.customer_organisation,
      status: o.status,
      paymentStatus: o.payment_status,
      paymentMethod: o.payment_method,
      units: Number(o.units),
      gross: round(total),
      net: round(net),
      shipping: round(Number(o.shipping_amount)),
      discount: round(Number(o.discount_amount)),
      charges: round(charges),
      refunds: round(refundsNet),
      income: round(income),
      cost: round(cost),
      profit: round(profit),
      // Of what the shop kept, not of what it charged: a fully refunded order
      // has no margin to speak of rather than a dreadful one.
      margin: kept > 0 ? round((profit / kept) * 100) : null,
      basis,
      costs: list,
    }
  })

  if (params.get('format') === 'csv') {
    const header = ['order', 'paid', 'customer', 'organisation', 'email', 'status', 'payment_method', 'units', 'gross', 'net', 'extra_charges', 'refunds_net', 'costs_net', 'profit', 'margin_pct', 'cost_basis', 'cost_refs']
    const lines = report.map((r) => [
      r.orderNumber, r.paidAt.replace('T', ' '), r.customer, r.organisation ?? '', r.email, r.status, r.paymentMethod, r.units,
      r.gross.toFixed(2), r.net.toFixed(2), r.charges.toFixed(2), r.refunds.toFixed(2), r.cost.toFixed(2), r.profit.toFixed(2),
      r.margin == null ? '' : r.margin.toFixed(1), r.basis, r.costs.map((c) => `${c.ref} ${c.amount.toFixed(2)}`).join('; '),
    ].map(csvCell).join(','))
    return new NextResponse([header.join(','), ...lines].join('\n'), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="profit-report-${period.fromDay}-to-${period.toDay}.csv"`,
      },
    })
  }

  return NextResponse.json({
    period: { from: period.fromDay, to: period.toDay, days: period.days, grouping: period.grouping, timezone },
    providers,
    failed,
    truncated,
    orders: report,
  })
}
