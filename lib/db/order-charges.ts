import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import type { ShpOrderCharge, ShpOrderChargeStatus, ShpOrderStatus } from '@/modules/shop/lib/types'

// Storage for extra charges raised on an order (migration 064). Every status
// change here is a single conditional UPDATE on the row's current status, so
// two things settling the same charge at once - the customer's own confirm and
// the payment provider's webhook, or a payment and a cancellation - can never
// both win. The caller learns which one did from whether a row came back.

function money(value: unknown): string {
  return (value as { toString(): string }).toString()
}

function mapCharge(r: Record<string, unknown>): ShpOrderCharge {
  return {
    id: r.id as string,
    orderId: r.order_id as string,
    reason: r.reason as string,
    note: (r.note as string | null) ?? null,
    netAmount: money(r.net_amount),
    taxRate: money(r.tax_rate),
    taxAmount: money(r.tax_amount),
    total: money(r.total),
    currency: r.currency as string,
    status: r.status as ShpOrderChargeStatus,
    holdOrder: r.hold_order as boolean,
    heldFromStatus: (r.held_from_status as ShpOrderStatus | null) ?? null,
    paymentMethod: (r.payment_method as string | null) ?? null,
    paymentReference: (r.payment_reference as string | null) ?? null,
    paidAt: (r.paid_at as Date | null) ?? null,
    refundId: (r.refund_id as string | null) ?? null,
    resolvedAt: (r.resolved_at as Date | null) ?? null,
    resolvedBy: (r.resolved_by as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

export async function listChargesForOrder(orderId: string): Promise<ShpOrderCharge[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_order_charges" WHERE "order_id" = ${orderId} ORDER BY "created_at" ASC
  `
  return rows.map(mapCharge)
}

export async function getChargeById(id: string): Promise<ShpOrderCharge | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_order_charges" WHERE "id" = ${id} LIMIT 1
  `
  return rows[0] ? mapCharge(rows[0]) : null
}

/** Thrown when the order already has a charge waiting to be paid. One at a
 *  time, so "the charge on this order" is never ambiguous. */
export class ChargeAlreadyPendingError extends Error {}

export type InsertChargeInput = {
  orderId: string
  reason: string
  note: string | null
  netAmount: number
  taxRate: number
  taxAmount: number
  total: number
  currency: string
  holdOrder: boolean
  heldFromStatus: ShpOrderStatus | null
  createdBy: string | null
}

export async function insertCharge(input: InsertChargeInput): Promise<ShpOrderCharge> {
  try {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      INSERT INTO "shp_order_charges" (
        "order_id", "reason", "note", "net_amount", "tax_rate", "tax_amount", "total", "currency",
        "hold_order", "held_from_status", "created_by"
      ) VALUES (
        ${input.orderId}, ${input.reason}, ${input.note}, ${input.netAmount}::numeric, ${input.taxRate}::numeric,
        ${input.taxAmount}::numeric, ${input.total}::numeric, ${input.currency},
        ${input.holdOrder}, ${input.heldFromStatus}, ${input.createdBy}
      )
      RETURNING *
    `
    return mapCharge(rows[0]!)
  } catch (error) {
    // 23505 is the one-pending-per-order index.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010') {
      const meta = error.meta as { code?: string } | undefined
      if (meta?.code === '23505') throw new ChargeAlreadyPendingError('This order already has a charge waiting to be paid.')
    }
    if (String((error as { message?: string }).message ?? '').includes('shp_order_charges_one_pending_key')) {
      throw new ChargeAlreadyPendingError('This order already has a charge waiting to be paid.')
    }
    throw error
  }
}

/** PENDING to PAID, once. Null when it was not pending - already paid, kept,
 *  or waived by the time this got there. */
export async function markChargePaid(
  id: string,
  payment: { method: string; reference: string | null; resolvedBy: string | null },
): Promise<ShpOrderCharge | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    UPDATE "shp_order_charges" SET
      "status" = 'PAID', "payment_method" = ${payment.method}, "payment_reference" = ${payment.reference},
      "paid_at" = CURRENT_TIMESTAMP, "resolved_at" = CURRENT_TIMESTAMP, "resolved_by" = ${payment.resolvedBy},
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id} AND "status" = 'PENDING'
    RETURNING *
  `
  return rows[0] ? mapCharge(rows[0]) : null
}

/** PENDING to WAIVED, once. */
export async function markChargeWaived(id: string, resolvedBy: string | null): Promise<ShpOrderCharge | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    UPDATE "shp_order_charges" SET
      "status" = 'WAIVED', "resolved_at" = CURRENT_TIMESTAMP, "resolved_by" = ${resolvedBy}, "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id} AND "status" = 'PENDING'
    RETURNING *
  `
  return rows[0] ? mapCharge(rows[0]) : null
}

/** PENDING to KEPT, once - taken BEFORE the refund goes out, so a payment
 *  arriving mid-cancellation finds the charge already spoken for. Given back
 *  with releaseKeptCharge if the refund does not happen. */
export async function claimChargeForCancellation(id: string, resolvedBy: string | null): Promise<ShpOrderCharge | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    UPDATE "shp_order_charges" SET
      "status" = 'KEPT', "resolved_at" = CURRENT_TIMESTAMP, "resolved_by" = ${resolvedBy}, "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id} AND "status" = 'PENDING'
    RETURNING *
  `
  return rows[0] ? mapCharge(rows[0]) : null
}

/** KEPT back to PENDING, for a cancellation whose refund was refused. Only a
 *  claim with no refund recorded against it can be given back. */
export async function releaseKeptCharge(id: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_order_charges" SET
      "status" = 'PENDING', "resolved_at" = NULL, "resolved_by" = NULL, "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id} AND "status" = 'KEPT' AND "refund_id" IS NULL
  `
}

export async function setChargeRefund(id: string, refundId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_order_charges" SET "refund_id" = ${refundId}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${id}
  `
}

/** Takes an order off the hold a charge put it on, back to the status it had
 *  before. Only while it is still ON_HOLD: an owner who has moved it on by hand
 *  since has made a decision this must not overrule. True when it moved. */
export async function restoreHeldOrderStatus(orderId: string, status: ShpOrderStatus): Promise<boolean> {
  const moved = await prisma.$executeRaw`
    UPDATE "shp_orders" SET "status" = ${status}, "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${orderId} AND "status" = 'ON_HOLD'
  `
  return moved > 0
}

/** After a cancellation that kept a fee back: every unit was refunded, so the
 *  refund marked the payment REFUNDED, but the shop still holds the fee. Part
 *  refunded is the true answer. Only moves it down from REFUNDED. */
export async function setOrderRefundedInPart(orderId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_orders" SET "payment_status" = 'PARTIALLY_REFUNDED', "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${orderId} AND "payment_status" = 'REFUNDED'
  `
}
