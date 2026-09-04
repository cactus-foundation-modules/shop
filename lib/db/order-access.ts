import { prisma } from '@/lib/db/prisma'

// PROTECTED - how hard somebody is allowed to guess at a guest's postcode.
//
// See migrations/038_order_access_attempts.sql for why this exists at all. The
// short of it: the order number is printed on every email the shop sends, so
// the delivery postcode is the whole lock on a guest's own order, and a UK
// postcode is roughly 1.8 million guesses wide - which is nothing to a machine
// and everything to a person who has genuinely forgotten whether they had it
// sent to the office.
//
// Deliberately keyed on the ORDER and not on the guesser. The in-memory limiter
// in lib/rate-limit.ts is keyed on their IP address, which they choose, and is
// per-instance besides, so on a serverless site it resets whenever a new box
// picks up the traffic. Between them: the IP limiter stops one machine going
// fast, and this stops a thousand machines going slowly at one order.
//
// Every comparison of one time with another happens in SQL against
// CURRENT_TIMESTAMP, never half in JavaScript: the columns are TIMESTAMP(3)
// without a zone, and a lock that is an hour long in one frame and an hour
// early in the other is a lock that does not lock.

/** Wrong postcodes before the order stops answering. Generous enough that a
 *  customer who cannot remember which of two addresses they used gets several
 *  goes; small enough that it is not a search. */
const MAX_FAILURES = 8

/** How long the order then stops answering for. Long enough to make guessing
 *  pointless, short enough that a real customer who locked themselves out over
 *  lunch is back in by the afternoon. */
const LOCK_MINUTES = 60

/** Failures older than this are somebody's forgotten typo rather than an
 *  attempt in progress, and the count starts again. Without it a customer who
 *  mistypes once a year is locked out on their eighth order. */
const FAILURE_WINDOW_MINUTES = 60

/** Rows nobody has touched for this long are swept, since a table with a line
 *  per mistyped postcode since the shop opened is a table nobody wanted. */
const KEEP_ROWS_DAYS = 30

export type OrderAccessLock = {
  /** True while this order refuses to answer, however right the postcode is. */
  locked: boolean
  /** Whole seconds until it will answer again. Zero when it is not locked. */
  retryAfterSeconds: number
}

const OPEN: OrderAccessLock = { locked: false, retryAfterSeconds: 0 }

/** Whether this order is currently refusing attempts. */
export async function getOrderAccessLock(orderId: string): Promise<OrderAccessLock> {
  const rows = await prisma.$queryRaw<Array<{ locked: boolean; retry_after: number }>>`
    SELECT
      ("locked_until" IS NOT NULL AND "locked_until" > CURRENT_TIMESTAMP) AS "locked",
      GREATEST(
        0,
        CEIL(EXTRACT(EPOCH FROM (COALESCE("locked_until", CURRENT_TIMESTAMP) - CURRENT_TIMESTAMP)))
      )::int AS "retry_after"
    FROM "shp_order_access_attempts"
    WHERE "order_id" = ${orderId}
    LIMIT 1
  `
  const row = rows[0]
  if (!row || !row.locked) return OPEN
  return { locked: true, retryAfterSeconds: row.retry_after }
}

/**
 * Records a wrong postcode, and locks the order if that was one too many.
 *
 * One statement, so two attempts arriving together cannot both read "seven" and
 * both write "eight". The count expression is repeated rather than shared
 * because a column being SET cannot be read back by another SET in the same
 * UPDATE - Postgres gives every assignment the row as it was before.
 */
export async function recordOrderAccessFailure(orderId: string): Promise<OrderAccessLock> {
  const rows = await prisma.$queryRaw<Array<{ locked: boolean; retry_after: number }>>`
    INSERT INTO "shp_order_access_attempts" ("order_id", "failed_count", "updated_at")
    VALUES (${orderId}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("order_id") DO UPDATE SET
      "failed_count" = CASE
        WHEN "shp_order_access_attempts"."updated_at"
             < CURRENT_TIMESTAMP - (${FAILURE_WINDOW_MINUTES}::int * INTERVAL '1 minute') THEN 1
        ELSE "shp_order_access_attempts"."failed_count" + 1
      END,
      "locked_until" = CASE
        WHEN (CASE
                WHEN "shp_order_access_attempts"."updated_at"
                     < CURRENT_TIMESTAMP - (${FAILURE_WINDOW_MINUTES}::int * INTERVAL '1 minute') THEN 1
                ELSE "shp_order_access_attempts"."failed_count" + 1
              END) >= ${MAX_FAILURES}::int
          THEN CURRENT_TIMESTAMP + (${LOCK_MINUTES}::int * INTERVAL '1 minute')
        ELSE "shp_order_access_attempts"."locked_until"
      END,
      "updated_at" = CURRENT_TIMESTAMP
    RETURNING
      ("locked_until" IS NOT NULL AND "locked_until" > CURRENT_TIMESTAMP) AS "locked",
      GREATEST(
        0,
        CEIL(EXTRACT(EPOCH FROM (COALESCE("locked_until", CURRENT_TIMESTAMP) - CURRENT_TIMESTAMP)))
      )::int AS "retry_after"
  `
  const row = rows[0]
  if (!row || !row.locked) return OPEN
  return { locked: true, retryAfterSeconds: row.retry_after }
}

/** Forgets everything about this order the moment somebody proves themselves.
 *  A customer who got it right on the seventh go starts their next visit clean. */
export async function clearOrderAccessFailures(orderId: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_order_access_attempts" WHERE "order_id" = ${orderId}`
}

/** Drops rows nobody has touched in a month and which are not holding a live
 *  lock. Called amortised from the route rather than on a timer, exactly as the
 *  in-memory limiter sweeps itself. */
export async function sweepOrderAccessAttempts(): Promise<number> {
  return prisma.$executeRaw`
    DELETE FROM "shp_order_access_attempts"
    WHERE "updated_at" < CURRENT_TIMESTAMP - (${KEEP_ROWS_DAYS}::int * INTERVAL '1 day')
      AND ("locked_until" IS NULL OR "locked_until" <= CURRENT_TIMESTAMP)
  `
}
