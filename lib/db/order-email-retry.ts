import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { mapOrderNote, type FailedOrderEmail, type OrderNoteRow } from '@/modules/shop/lib/db/orders'

// The retry state of a failed order email, kept on the note that already
// carries the message as rendered (migrations 067 and 076). Every time is the
// database's own clock, never the function's: the tries are spread across
// several short-lived requests (lib/order-email-retry.ts), and two clocks
// would disagree about whether a try is due.

const seconds = (ms: number) => Prisma.sql`make_interval(secs => ${ms / 1000}::double precision)`

/** The note for a send that has just failed, with the retry started when
 *  `retryForMs` is given. Its id, for nothing to look it up by later. */
export async function insertFailedEmailNote(
  orderId: string,
  content: string,
  failedEmail: FailedOrderEmail,
  retry: { forMs: number; firstGapMs: number } | null,
): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "shp_order_notes" ("order_id", "content", "is_internal", "created_by", "failed_email", "email_retry_until", "email_next_try_at")
    VALUES (
      ${orderId}, ${content}, true, NULL, ${JSON.stringify(failedEmail)}::jsonb,
      ${retry ? Prisma.sql`CURRENT_TIMESTAMP + ${seconds(retry.forMs)}` : Prisma.sql`NULL`},
      ${retry ? Prisma.sql`CURRENT_TIMESTAMP + ${seconds(retry.firstGapMs)}` : Prisma.sql`NULL`}
    )
    RETURNING "id"
  `
  return rows[0]?.id ?? null
}

/** One unsettled failed email, held for a Resend click. Null when it has gone,
 *  been replaced, belongs to another order, or is being sent right now. */
export async function claimNoteForResend(noteId: string, orderId: string, leaseMs: number): Promise<OrderNoteRow | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    UPDATE "shp_order_notes"
    SET "email_lease_until" = CURRENT_TIMESTAMP + ${seconds(leaseMs)}
    WHERE "id" = ${noteId} AND "order_id" = ${orderId}
      AND "failed_email" IS NOT NULL
      AND "email_settled_at" IS NULL
      AND ("email_lease_until" IS NULL OR "email_lease_until" < CURRENT_TIMESTAMP)
    RETURNING *
  `
  return rows[0] ? mapOrderNote(rows[0]) : null
}

/** The failed emails due another try, each held for this request alone - the
 *  lease is taken by the statement that picks them, so two requests running
 *  at once cannot both send one. */
export async function claimDueRetries(leaseMs: number, limit: number): Promise<OrderNoteRow[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    UPDATE "shp_order_notes"
    SET "email_lease_until" = CURRENT_TIMESTAMP + ${seconds(leaseMs)}
    WHERE "id" IN (
      SELECT "id" FROM "shp_order_notes"
      WHERE "email_next_try_at" IS NOT NULL
        AND "email_settled_at" IS NULL
        AND "email_next_try_at" <= CURRENT_TIMESTAMP
        AND ("email_lease_until" IS NULL OR "email_lease_until" < CURRENT_TIMESTAMP)
      ORDER BY "email_next_try_at"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
      AND "email_settled_at" IS NULL
      AND ("email_lease_until" IS NULL OR "email_lease_until" < CURRENT_TIMESTAMP)
    RETURNING *
  `
  return rows.map(mapOrderNote)
}

/**
 * A try that failed. The lease goes and the next try is booked `gapMs` away,
 * unless that is past the end of the retry - then the tries stop and the note
 * waits for Resend. `restartForMs` gives the retry a fresh window, for a Resend
 * click that failed: whoever pressed it wanted the email to go.
 */
export async function recordFailedTry(
  noteId: string,
  lastError: string,
  opts: { gapMs: number; restartForMs: number | null },
): Promise<OrderNoteRow | null> {
  const until = opts.restartForMs === null
    ? Prisma.sql`"email_retry_until"`
    : Prisma.sql`CURRENT_TIMESTAMP + ${seconds(opts.restartForMs)}`
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    UPDATE "shp_order_notes"
    SET "email_tries" = "email_tries" + 1,
        "email_lease_until" = NULL,
        "failed_email" = "failed_email" || jsonb_build_object('lastError', ${lastError}::text),
        "email_retry_until" = ${until},
        "email_next_try_at" = CASE
          WHEN ${until} IS NOT NULL AND CURRENT_TIMESTAMP + ${seconds(opts.gapMs)} < ${until}
            THEN CURRENT_TIMESTAMP + ${seconds(opts.gapMs)}
          ELSE NULL
        END
    WHERE "id" = ${noteId}
    RETURNING *
  `
  return rows[0] ? mapOrderNote(rows[0]) : null
}

/** The email went, or something newer replaced it: no more tries, no Resend,
 *  and the note says which. */
export async function settleEmailNote(noteId: string, content: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_order_notes"
    SET "email_settled_at" = CURRENT_TIMESTAMP,
        "email_next_try_at" = NULL,
        "email_lease_until" = NULL,
        "content" = ${content}
    WHERE "id" = ${noteId}
  `
}

export async function setEmailNoteContent(noteId: string, content: string): Promise<void> {
  await prisma.$executeRaw`UPDATE "shp_order_notes" SET "content" = ${content} WHERE "id" = ${noteId}`
}

/** The retries whose five minutes are up, stopped. Returned so each note can be
 *  reworded to say so. One being sent right now is left to finish its try. */
export async function stopExpiredRetries(): Promise<OrderNoteRow[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    UPDATE "shp_order_notes"
    SET "email_next_try_at" = NULL
    WHERE "email_next_try_at" IS NOT NULL
      AND "email_settled_at" IS NULL
      AND "email_retry_until" <= CURRENT_TIMESTAMP
      AND ("email_lease_until" IS NULL OR "email_lease_until" < CURRENT_TIMESTAMP)
    RETURNING *
  `
  return rows.map(mapOrderNote)
}

/** How long until the next retry anywhere on the site can be tried - its own
 *  time, or the end of the lease on one being sent right now. Null when
 *  nothing is retrying. */
export async function msUntilNextRetry(): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ ms: number | null }[]>`
    SELECT (EXTRACT(EPOCH FROM (
      MIN(GREATEST("email_next_try_at", COALESCE("email_lease_until", "email_next_try_at"))) - CURRENT_TIMESTAMP
    )) * 1000)::float8 AS "ms"
    FROM "shp_order_notes"
    WHERE "email_next_try_at" IS NOT NULL AND "email_settled_at" IS NULL
  `
  const ms = rows[0]?.ms
  return ms === null || ms === undefined ? null : Math.max(0, Number(ms))
}

/** The unsettled failed emails about one parcel, among `triggers` - the ones
 *  a newer email about the same thing is about to make out of date. */
export async function openEmailsForShipment(orderId: string, shipmentId: string, triggers: readonly string[]): Promise<OrderNoteRow[]> {
  if (triggers.length === 0) return []
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_order_notes"
    WHERE "order_id" = ${orderId}
      AND "failed_email" IS NOT NULL
      AND "email_settled_at" IS NULL
      AND "failed_email"->>'shipmentId' = ${shipmentId}
      AND "failed_email"->>'trigger' IN (${Prisma.join([...triggers])})
  `
  return rows.map(mapOrderNote)
}
