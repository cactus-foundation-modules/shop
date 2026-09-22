import { Prisma } from '@prisma/client'

// The dashboard's thirty-day money, worked out once for the two places that show
// it: the widget on the admin home page and the JSON route beside it.
//
// Two rules meet here, both from migration 052. MONEY FOLLOWS payment_status, so
// the revenue figure is every paid order's total - a spare the customer was
// charged for is money the shop took, and a free one adds nothing. COUNTS FOLLOW
// kind, so "orders" is sales only - a warranty part is not another order.
//
// The average is where those two used to collide. It divided all the money by
// the sales alone, so every charged spare inflated the average of orders it was
// never part of - and the widget, which did not filter its count at all, let
// every free part drag the average down instead. The average is sales' money
// over sales, and nothing else.
//
// Decimal throughout. SUM of a NUMERIC comes back exact, and turning it into a
// float before dividing is how a dashboard ends up a penny out from the report
// that kept the figure as a string.

export type RevenueSummaryRow = {
  /** SUM("total") over every paid order. Null when there were none. */
  revenue: Prisma.Decimal.Value | null
  /** The same SUM, sales only. */
  sale_revenue: Prisma.Decimal.Value | null
  /** Paid sales. */
  order_count: bigint | number | null
}

export type RevenueSummary = {
  /** Two decimal places, as the rest of the shop carries money. */
  revenue: string
  orderCount: number
  averageOrderValue: string
}

export function summariseRevenue(row: RevenueSummaryRow | undefined): RevenueSummary {
  const revenue = new Prisma.Decimal(row?.revenue ?? 0)
  const saleRevenue = new Prisma.Decimal(row?.sale_revenue ?? 0)
  const orderCount = Number(row?.order_count ?? 0)
  const average = orderCount > 0 ? saleRevenue.div(orderCount) : new Prisma.Decimal(0)
  return {
    revenue: revenue.toFixed(2),
    orderCount,
    averageOrderValue: average.toFixed(2),
  }
}
