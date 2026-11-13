import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import type { ShpOrderKind, ShpOrderStatus, ShpPaymentStatus } from '@/modules/shop/lib/types'

// What one member has bought, for the admin member page (the core
// members.admin-member-detail extension point).
//
// Whose orders: every order on the account, plus guest orders placed at the
// account's email address that nobody has claimed yet. The second set is the
// interesting one for staff - the customer who bought twice as a guest and then
// made an account is a returning customer, not a new one - but it is only
// PROVABLY theirs once the address is verified (see claimGuestOrdersForMember),
// so the caller is told how many of them there are and says so on screen
// rather than folding them in silently. Nothing here claims anything: a read on
// an admin page must never move an order between accounts.
//
// Money follows payment_status and counts follow kind, on the same rules as
// the dashboard widget: a warranty replacement (kind REPLACEMENT) is not
// another sale, and a refunded order was still paid - the refund comes off as
// a refund, from shp_refunds, so lifetime spend is what they actually paid and
// kept paid rather than a figure that changes when an order's status does.

const PAID_STATES = Prisma.sql`('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')`
const OWED_STATES = Prisma.sql`('PENDING', 'AWAITING_CONFIRMATION')`

export type MemberSalesTotalsRow = {
  paid_orders: bigint | null
  gross: Prisma.Decimal | string | null
  owed_orders: bigint | null
  owed_total: Prisma.Decimal | string | null
  guest_orders: bigint | null
  first_order_at: Date | null
  last_order_at: Date | null
}

export type MemberSalesSummary = {
  paidOrders: number
  /** Paid, less completed refunds. Two decimal places, as a string. */
  netSpend: string
  refunded: string
  averageOrderValue: string
  /** Placed but not paid yet - a bank transfer still to land, a card that never went through. */
  owedOrders: number
  owedTotal: string
  /** Unclaimed guest orders at the account's address counted in here. */
  guestOrders: number
  firstOrderAt: Date | null
  lastOrderAt: Date | null
}

/** Pure: the totals row and the refund sum, turned into figures to show. */
export function summariseMemberSales(row: MemberSalesTotalsRow | undefined, refunded: Prisma.Decimal | string | null): MemberSalesSummary {
  const paidOrders = Number(row?.paid_orders ?? 0)
  const gross = new Prisma.Decimal(row?.gross ?? 0)
  const refunds = new Prisma.Decimal(refunded ?? 0)
  const net = Prisma.Decimal.max(gross.minus(refunds), 0)
  return {
    paidOrders,
    netSpend: net.toFixed(2),
    refunded: refunds.toFixed(2),
    averageOrderValue: (paidOrders > 0 ? net.div(paidOrders) : new Prisma.Decimal(0)).toFixed(2),
    owedOrders: Number(row?.owed_orders ?? 0),
    owedTotal: new Prisma.Decimal(row?.owed_total ?? 0).toFixed(2),
    guestOrders: Number(row?.guest_orders ?? 0),
    firstOrderAt: row?.first_order_at ?? null,
    lastOrderAt: row?.last_order_at ?? null,
  }
}

export type MemberRecentOrder = {
  id: string
  orderNumber: string
  kind: ShpOrderKind
  status: ShpOrderStatus
  paymentStatus: ShpPaymentStatus
  total: string
  createdAt: Date
  isGuest: boolean
  customerName: string
  customerOrganisation: string | null
}

export type MemberTopProduct = { productName: string; quantity: number; total: string }

export type MemberConsentSource = { orderId: string; orderNumber: string; createdAt: Date; consent: boolean; isGuest: boolean }

export type MemberSales = {
  summary: MemberSalesSummary
  recentOrders: MemberRecentOrder[]
  topProducts: MemberTopProduct[]
  /** The order the account's marketing answer came from, where one did. */
  consentSource: MemberConsentSource | null
}

export async function getMemberSales(member: { id: string; email: string }, recentLimit = 6): Promise<MemberSales> {
  const email = member.email.trim()
  // One definition of "theirs", reused by every query below.
  const theirs = Prisma.sql`("member_id" = ${member.id} OR ("member_id" IS NULL AND LOWER("customer_email") = LOWER(${email})))`

  const [totalsRows, refundRows, recentRows, topRows, consentRows] = await Promise.all([
    prisma.$queryRaw<MemberSalesTotalsRow[]>`
      SELECT
        COUNT(*) FILTER (WHERE "kind" = 'SALE' AND "payment_status" IN ${PAID_STATES})::bigint AS paid_orders,
        SUM("total") FILTER (WHERE "kind" = 'SALE' AND "payment_status" IN ${PAID_STATES}) AS gross,
        COUNT(*) FILTER (WHERE "kind" = 'SALE' AND "payment_status" IN ${OWED_STATES} AND "status" <> 'CANCELLED')::bigint AS owed_orders,
        SUM("total") FILTER (WHERE "kind" = 'SALE' AND "payment_status" IN ${OWED_STATES} AND "status" <> 'CANCELLED') AS owed_total,
        COUNT(*) FILTER (WHERE "member_id" IS NULL)::bigint AS guest_orders,
        MIN("created_at") FILTER (WHERE "kind" = 'SALE') AS first_order_at,
        MAX("created_at") FILTER (WHERE "kind" = 'SALE') AS last_order_at
      FROM "shp_orders"
      WHERE ${theirs}
    `,
    prisma.$queryRaw<{ refunded: Prisma.Decimal | null }[]>`
      SELECT SUM(r."amount") AS refunded
      FROM "shp_refunds" r
      JOIN "shp_orders" o ON o."id" = r."order_id"
      WHERE r."status" = 'COMPLETED' AND o."kind" = 'SALE'
        AND (o."member_id" = ${member.id} OR (o."member_id" IS NULL AND LOWER(o."customer_email") = LOWER(${email})))
    `,
    prisma.$queryRaw<Array<{
      id: string
      order_number: string
      kind: ShpOrderKind
      status: ShpOrderStatus
      payment_status: ShpPaymentStatus
      total: Prisma.Decimal
      created_at: Date
      is_guest: boolean
      customer_name: string
      customer_organisation: string | null
    }>>`
      SELECT "id", "order_number", "kind", "status", "payment_status", "total", "created_at", ("member_id" IS NULL) AS is_guest,
             "customer_name", "customer_organisation"
      FROM "shp_orders"
      WHERE ${theirs}
      ORDER BY "created_at" DESC
      LIMIT ${recentLimit}
    `,
    prisma.$queryRaw<Array<{ product_name: string; quantity: bigint; total: Prisma.Decimal }>>`
      SELECT i."product_name", SUM(i."quantity")::bigint AS quantity, SUM(i."total") AS total
      FROM "shp_order_items" i
      JOIN "shp_orders" o ON o."id" = i."order_id"
      WHERE o."kind" = 'SALE' AND o."payment_status" IN ${PAID_STATES}
        AND (o."member_id" = ${member.id} OR (o."member_id" IS NULL AND LOWER(o."customer_email") = LOWER(${email})))
      GROUP BY i."product_name"
      ORDER BY SUM(i."total") DESC, i."product_name"
      LIMIT 3
    `,
    // Same rule as latestMarketingConsent: only an answer given about the
    // account's own address counts, newest first.
    prisma.$queryRaw<Array<{ id: string; order_number: string; created_at: Date; marketing_consent: boolean; is_guest: boolean }>>`
      SELECT "id", "order_number", "created_at", "marketing_consent", ("member_id" IS NULL) AS is_guest
      FROM "shp_orders"
      WHERE ${theirs} AND "marketing_consent" IS NOT NULL AND LOWER(TRIM("customer_email")) = LOWER(${email})
      ORDER BY "created_at" DESC
      LIMIT 1
    `,
  ])

  const consent = consentRows[0]
  return {
    summary: summariseMemberSales(totalsRows[0], refundRows[0]?.refunded ?? null),
    recentOrders: recentRows.map((r) => ({
      id: r.id,
      orderNumber: r.order_number,
      kind: r.kind,
      status: r.status,
      paymentStatus: r.payment_status,
      total: new Prisma.Decimal(r.total).toFixed(2),
      createdAt: r.created_at,
      isGuest: r.is_guest,
      customerName: r.customer_name,
      customerOrganisation: r.customer_organisation,
    })),
    topProducts: topRows.map((r) => ({
      productName: r.product_name,
      quantity: Number(r.quantity),
      total: new Prisma.Decimal(r.total).toFixed(2),
    })),
    consentSource: consent
      ? { orderId: consent.id, orderNumber: consent.order_number, createdAt: consent.created_at, consent: consent.marketing_consent, isGuest: consent.is_guest }
      : null,
  }
}
