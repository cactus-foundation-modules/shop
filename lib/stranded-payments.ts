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
