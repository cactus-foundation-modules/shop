// A payment that was taken and produced no order.
//
// See migrations/048_stranded_payments.sql for why this exists. In one line: the
// hosted-payment methods create their order at settlement, after the money, so a
// failure there is silent - the draft looks like any other abandoned checkout and
// the shopper sees a crash. This is the thing that notices.
//
// Every function here is best-effort by design. They run on the failure path of a
// settlement that has already gone wrong, and an alarm that throws while raising
// itself would turn a recoverable incident into a lost one. The original error is
// always what reaches the caller.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

export type StrandedPayment = {
  draftId: string
  orderNumber: string
  paymentMethod: string
  customerEmail: string | null
  customerName: string | null
  total: string
  currency: string
  error: string
  attempts: number
  firstSeenAt: Date
  lastSeenAt: Date
}

// Long enough to hold a Postgres error with its detail, short enough that a
// runaway stack cannot bloat the row it is trying to warn somebody about.
const MAX_ERROR_CHARS = 2000

function errorText(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.slice(0, MAX_ERROR_CHARS)
  return String(err).slice(0, MAX_ERROR_CHARS)
}

/**
 * Write down that this draft's money is real and its order is not.
 *
 * The draft is still there - the transaction that failed rolled back, which is
 * the whole reason nothing else knows - so the customer and the amount are read
 * back off it rather than passed in, and a settlement path that knows only an id
 * can still raise a complete alarm.
 *
 * One row per draft. A provider that retries its webhook every few minutes would
 * otherwise bury the signal under copies of itself, so a repeat bumps `attempts`
 * and the timestamp instead.
 */
export async function recordStrandedPayment(draftId: string, err: unknown): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO "shp_stranded_payments" (
        "draft_id", "order_number", "payment_method", "customer_email", "customer_name",
        "total", "currency", "error"
      )
      SELECT d."id", d."order_number", d."payment_method", d."customer_email", d."customer_name",
             d."total", d."currency", ${errorText(err)}
        FROM "shp_checkout_drafts" d
       WHERE d."id" = ${draftId}
      ON CONFLICT ("draft_id") DO UPDATE
        SET "error" = EXCLUDED."error",
            "attempts" = "shp_stranded_payments"."attempts" + 1,
            "last_seen_at" = CURRENT_TIMESTAMP
    `
  } catch (writeErr) {
    // Loud, because this is the alarm failing to sound. Never rethrown: the
    // settlement's own error is the one that matters to the caller.
    console.error(`[shop] could not record a stranded payment for draft ${draftId}`, writeErr)
  }
}

/**
 * A payment that arrived for an order which no longer exists.
 *
 * The on-page card methods create an unpaid order the moment a shopper picks
 * them, and the daily sweep clears unpaid orders after a day
 * (pruneAbandonedPendingOrders). A card box left open in a tab for longer than
 * that can still be paid - Stripe's payment intents do not expire - and the
 * money then lands against an order the sweep has already removed. The webhook
 * found nothing to mark paid and said nothing, which is the one failure this
 * table exists to stop being silent.
 *
 * Filed on the same banner as a draft that never became an order, keyed on the
 * order id the payment was taken for: a provider retrying the webhook bumps
 * `attempts` instead of adding rows. There is no draft to rebuild it from, so
 * the note says what to do instead.
 */
export async function recordOrphanedPayment(input: {
  orderId: string
  orderNumber: string
  paymentMethod: string
  amountMinorUnits: number
  currency: string
}): Promise<void> {
  try {
    // Pence to pounds without passing through a float: the column is NUMERIC.
    const total = new Prisma.Decimal(input.amountMinorUnits).div(100).toFixed(2)
    const note = "Paid after its unpaid order had been cleared away (unpaid orders are removed after a day), so there is no order and nothing to rebuild it from. Refund the payment in your provider's account, or take the order again by hand and keep the payment."
    await prisma.$executeRaw`
      INSERT INTO "shp_stranded_payments" (
        "draft_id", "order_number", "payment_method", "total", "currency", "error"
      ) VALUES (
        ${input.orderId}, ${input.orderNumber}, ${input.paymentMethod},
        ${total}::numeric, ${input.currency.toUpperCase()}, ${note}
      )
      ON CONFLICT ("draft_id") DO UPDATE
        SET "attempts" = "shp_stranded_payments"."attempts" + 1,
            "last_seen_at" = CURRENT_TIMESTAMP
    `
  } catch (writeErr) {
    console.error(`[shop] could not record an orphaned payment for order ${input.orderId}`, writeErr)
  }
}

/**
 * The draft became an order after all - so the alarm was transient and clears
 * itself. Called on every successful materialisation, including the idempotent
 * "somebody else already made it" path, because that is exactly what a webhook
 * arriving after a failed redirect looks like.
 */
export async function clearStrandedPayment(draftId: string): Promise<void> {
  try {
    await prisma.$executeRaw`DELETE FROM "shp_stranded_payments" WHERE "draft_id" = ${draftId}`
  } catch (err) {
    console.error(`[shop] could not clear the stranded-payment record for draft ${draftId}`, err)
  }
}

function mapRow(r: Record<string, unknown>): StrandedPayment {
  return {
    draftId: r.draft_id as string,
    orderNumber: r.order_number as string,
    paymentMethod: r.payment_method as string,
    customerEmail: (r.customer_email as string | null) ?? null,
    customerName: (r.customer_name as string | null) ?? null,
    total: (r.total as { toString(): string }).toString(),
    currency: r.currency as string,
    error: r.error as string,
    attempts: Number(r.attempts),
    firstSeenAt: r.first_seen_at as Date,
    lastSeenAt: r.last_seen_at as Date,
  }
}

/** Oldest first: the one that has been stranded longest is the one to chase. */
export async function listStrandedPayments(limit = 20): Promise<StrandedPayment[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_stranded_payments" ORDER BY "first_seen_at" ASC LIMIT ${limit}
  `
  return rows.map(mapRow)
}

export async function countStrandedPayments(): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM "shp_stranded_payments"
  `
  return rows[0]?.n ?? 0
}
