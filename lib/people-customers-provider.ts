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
type PeopleContactDetails = { fullName?: string | null; organisation?: string | null }
type PeopleCustomerProvider = {
  isCustomerSql: (refs: PeopleCustomerRefs) => Prisma.Sql
  summarise: (people: ReadonlyArray<{ memberId: string; email: string }>) => Promise<Record<string, PeopleCustomerSummary>>
  contactDetails: (people: ReadonlyArray<{ memberId: string; email: string }>) => Promise<Record<string, PeopleContactDetails>>
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

// What the newest order says, for members whose account is still blank. Core
// only asks about verified members, and it is only ever shown, never saved. An
// order counts as theirs by member_id, or as a still-unclaimed guest order at
// their address - the same "theirs" as above. Newest first, so somebody who has
// moved firms reads as the firm they last bought from.
type ContactRow = { member_id: string; customer_name: string; customer_organisation: string | null; billing_company: string | null; billing_present: boolean; shipping_company: string | null }

async function contactDetails(people: ReadonlyArray<{ memberId: string; email: string }>): Promise<Record<string, PeopleContactDetails>> {
  if (people.length === 0) return {}
  const rows = await prisma.$queryRaw<ContactRow[]>`
    WITH people AS (
      SELECT * FROM UNNEST(${people.map((p) => p.memberId)}::text[], ${people.map((p) => p.email)}::text[]) AS p(member_id, email)
    )
    SELECT DISTINCT ON (p.member_id) p.member_id, o."customer_name", o."customer_organisation",
      o."billing_address"->>'company' AS billing_company,
      (o."billing_address" IS NOT NULL AND o."billing_address" <> 'null'::jsonb) AS billing_present,
      o."shipping_address"->>'company' AS shipping_company
    FROM people p
    JOIN "shp_orders" o
      ON o."member_id" = p.member_id OR (o."member_id" IS NULL AND LOWER(o."customer_email") = LOWER(p.email))
    WHERE o."kind" = 'SALE'
    ORDER BY p.member_id, o."created_at" DESC
  `
  const out: Record<string, PeopleContactDetails> = {}
  for (const row of rows) {
    const company = row.customer_organisation?.trim()
      || row.billing_company?.trim()
      || (row.billing_present ? null : row.shipping_company?.trim() || null)
    out[row.member_id] = { fullName: row.customer_name, organisation: company }
  }
  return out
}

export const shopPeopleCustomers: PeopleCustomerProvider = { isCustomerSql, summarise, contactDetails }
