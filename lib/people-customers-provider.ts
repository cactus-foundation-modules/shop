import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { getSiteTimezone } from '@/lib/config/timezone.server'
import { formatInSiteTimezone } from '@/lib/config/timezone'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { formatMoney } from '@/modules/shop/lib/money'

// The shop's answer to core's core.people-customers extension point: which
// members on Admin › Users are customers, and a line about each.
//
// A customer is somebody with at least one PAID sale - a refunded one still
// counts, it was bought - on their account, or placed as a guest at their
// address and not yet claimed (the same "theirs" as lib/member-sales.ts, and
// as claimGuestOrdersForMember: lower() on both sides). Warranty replacements
// are not sales and do not make anybody a customer. An order that was never
// paid for does not either: an abandoned bank transfer is not a purchase.

const PAID_STATES = Prisma.sql`('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')`

// The contract's shapes, spelt out here rather than imported from core's
// lib/members/people-customers.ts. Structurally identical, so core accepts the
// provider; and the shop still builds on a core release from before the point
// existed, where it is simply never called.
type PeopleCustomerRefs = { memberId: Prisma.Sql; email: Prisma.Sql }
type PeopleCustomerSummary = { label: string; title?: string }
type PeopleCustomerProvider = {
  isCustomerSql: (refs: PeopleCustomerRefs) => Prisma.Sql
  summarise: (people: ReadonlyArray<{ memberId: string; email: string }>) => Promise<Record<string, PeopleCustomerSummary>>
}

function isCustomerSql({ memberId, email }: PeopleCustomerRefs): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "shp_orders" so
    WHERE so."kind" = 'SALE' AND so."payment_status" IN ${PAID_STATES}
      AND (so."member_id" = ${memberId} OR (so."member_id" IS NULL AND LOWER(so."customer_email") = LOWER(${email})))
  )`
}

type SummaryRow = { member_id: string; orders: bigint; gross: Prisma.Decimal | null; refunded: Prisma.Decimal | null; last_order_at: Date | null }

async function summarise(people: ReadonlyArray<{ memberId: string; email: string }>): Promise<Record<string, PeopleCustomerSummary>> {
  if (people.length === 0) return {}
  const ids = people.map((p) => p.memberId)
  const emails = people.map((p) => p.email)

  const [rows, config, timezone] = await Promise.all([
    prisma.$queryRaw<SummaryRow[]>`
      WITH people AS (
        SELECT * FROM UNNEST(${ids}::text[], ${emails}::text[]) AS p(member_id, email)
      ),
      theirs AS (
        SELECT p.member_id, o."id", o."total", o."created_at"
        FROM people p
        JOIN "shp_orders" o
          ON o."member_id" = p.member_id OR (o."member_id" IS NULL AND LOWER(o."customer_email") = LOWER(p.email))
        WHERE o."kind" = 'SALE' AND o."payment_status" IN ${PAID_STATES}
      )
      SELECT t.member_id,
        COUNT(*)::bigint AS orders,
        SUM(t."total") AS gross,
        SUM(COALESCE(rf.refunded, 0)) AS refunded,
        MAX(t."created_at") AS last_order_at
      FROM theirs t
      LEFT JOIN (
        SELECT "order_id", SUM("amount") AS refunded FROM "shp_refunds" WHERE "status" = 'COMPLETED' GROUP BY "order_id"
      ) rf ON rf."order_id" = t."id"
      GROUP BY t.member_id
    `,
    getShopConfigCached(),
    getSiteTimezone(),
  ])

  const out: Record<string, PeopleCustomerSummary> = {}
  for (const row of rows) {
    const orders = Number(row.orders)
    const net = Prisma.Decimal.max(new Prisma.Decimal(row.gross ?? 0).minus(new Prisma.Decimal(row.refunded ?? 0)), 0)
    out[row.member_id] = {
      label: `${orders} ${orders === 1 ? 'order' : 'orders'} · ${formatMoney(net.toFixed(2), config.currencySymbol)}`,
      title: row.last_order_at
        ? `Spent after refunds. Last ordered ${formatInSiteTimezone(row.last_order_at, timezone, { day: 'numeric', month: 'short', year: 'numeric' })}.`
        : undefined,
    }
  }
  return out
}

export const shopPeopleCustomers: PeopleCustomerProvider = { isCustomerSql, summarise }
