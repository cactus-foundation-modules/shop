import { sendEmail, type EmailAttachment } from '@/lib/email/index'
import { cronCallEnvironment } from '@/lib/cron/run'
import { logOrderEmail, type FailedOrderEmail, type OrderNoteRow } from '@/modules/shop/lib/db/orders'
import {
  claimDueRetries,
  claimNoteForResend,
  insertFailedEmailNote,
  msUntilNextRetry,
  openEmailsForShipment,
  recordFailedTry,
  setEmailNoteContent,
  settleEmailNote,
  stopExpiredRetries,
} from '@/modules/shop/lib/db/order-email-retry'
import { recordToldWindow } from '@/modules/shop/lib/db/shipments'

// A failed order email tries again on its own, every few seconds, for five
// minutes - then waits for Resend (migration 076).
//
// WHY A CHAIN OF REQUESTS
//
// Every module route lives under one 60-second ceiling, and a single refused
// send can eat most of it: DW000245's window email took 57 seconds to be told
// "Greeting never received". Five minutes of trying cannot happen inside the
// request that failed, and the site's only schedule ticks every half hour.
//
// So the tries run in links. A link is one short call to
// /api/m/shop/cron/email-retry, which answers at once and does its work after
// the answer (Next's after()). It waits for the next try that is due, makes it,
// and before it does - a send may take the rest of its life - calls the next
// link. A link with nothing due before its own time runs out waits out its
// budget and hands on. The chain ends when nothing anywhere is still trying.
// Waiting is a timer, not work, so a link costs next to nothing while it waits.
//
// Every try is leased by the statement that picks it (lib/db/order-email-retry),
// so two links, or a link and a Resend click, cannot both send one email.

/** How long a failed email keeps trying on its own. */
export const RETRY_FOR_MS = 5 * 60_000
/** Between one try and the next. */
export const RETRY_GAP_MS = 10_000
/** How long a try holds its note. Longer than any one send can take inside a
 *  60-second request, so a lease only lapses on a request that died. */
const LEASE_MS = 75_000
/** A link's own working life, inside the 60-second ceiling with room for the
 *  send it might start at the very end. */
const LINK_BUDGET_MS = 40_000
/** Notes one link sends at once. More than this many failing together is an
 *  outage, and the next link takes the rest ten seconds later. */
const LINK_BATCH = 5

const ROUTE = '/api/m/shop/cron/email-retry'

// Every email about one order goes on one conversation in the inbox, whatever
// its subject - they all have their own, and the subject was all the inbox had
// to thread them on. Staff alerts are left out: they are about the order but
// not to the customer, and filing them under it would put "New order received"
// in the middle of what the customer was told.
export function threadKeyFor(trigger: string, orderId: string | undefined): { threadKey?: string } {
  if (!orderId || trigger.startsWith('ADMIN_')) return {}
  return { threadKey: `shop-order:${orderId}` }
}

/**
 * Emails that say where a parcel's delivery stands. A newer one about the same
 * parcel makes an unsent older one wrong - a window that has moved, a delay
 * reported after it - so the older one is dropped rather than retried into the
 * customer's inbox after the news that replaced it.
 */
const DELIVERY_NEWS = [
  'DELIVERY_SLOT_CONFIRMED',
  'DELIVERY_DAY_BOOKED',
  'DELIVERY_NEW_DATE',
  'DELIVERY_DELAYED',
  'DELIVERY_RUNNING_LATE',
] as const

export function triggersReplacedBy(trigger: string): readonly string[] {
  return (DELIVERY_NEWS as readonly string[]).includes(trigger) ? DELIVERY_NEWS : [trigger]
}

// How much of the email service's own words to keep on the note: enough to tell
// "not configured" from "address refused" from "service down", not a stack.
const FAILED_EMAIL_REASON_CHARS = 300

export function failureReason(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).replace(/\s+/g, ' ').trim().slice(0, FAILED_EMAIL_REASON_CHARS)
}

/** Whether this site can run the chain at all - it needs the same two things
 *  a scheduled job does. Without them a failed email waits for Resend. */
export function canRetryEmails(): boolean {
  return !('error' in cronCallEnvironment())
}

// ---------------------------------------------------------------------------
// What the note says. One function per state, so the order's activity always
// reads as where the email actually is.
// ---------------------------------------------------------------------------

type NoteEmail = Pick<FailedOrderEmail, 'subject' | 'to'>
const said = (reason: string) => reason || 'no further detail.'
const sinceFirst = (tries: number) => `${tries + 1} ${tries === 0 ? 'try' : 'tries'}`

export function retryingNoteText(email: NoteEmail, reason: string, tries: number): string {
  const sofar = tries === 0 ? 'did not go' : `has not gone after ${sinceFirst(tries)}`
  return `Email not sent yet: "${email.subject}" to ${email.to} ${sofar}. The email service said: ${said(reason)} Trying again on its own every ${RETRY_GAP_MS / 1000} seconds for ${RETRY_FOR_MS / 60_000} minutes - Resend below if you would rather not wait.`
}

export function failedNoteText(email: NoteEmail, reason: string, tries: number): string {
  const tried = tries === 0 ? '' : ` Tried ${sinceFirst(tries)}.`
  return `Email not sent: "${email.subject}" to ${email.to} did not go, so it has not arrived.${tried} The email service said: ${said(reason)} Use Resend below once that is fixed.`
}

export function sentNoteText(email: NoteEmail, tries: number): string {
  return `Email sent: "${email.subject}" to ${email.to} went on try ${tries + 1}, after the email service refused it the first time.`
}

export function replacedNoteText(email: NoteEmail): string {
  return `Email dropped: "${email.subject}" to ${email.to} never went, and a newer email about the same parcel has taken its place.`
}

// ---------------------------------------------------------------------------

/**
 * Put a failed send on the order's timeline, carrying what a retry or a Resend
 * click needs to send it exactly as written, and start the retry where the site
 * can run one. Best-effort: the send's own error is what the caller acts on.
 */
export async function noteFailedOrderEmail(orderId: string, email: FailedOrderEmail, err: unknown): Promise<void> {
  const reason = failureReason(err)
  const retrying = canRetryEmails()
  try {
    await insertFailedEmailNote(
      orderId,
      retrying ? retryingNoteText(email, reason, 0) : failedNoteText(email, reason, 0),
      { ...email, lastError: reason },
      retrying ? { forMs: RETRY_FOR_MS, firstGapMs: RETRY_GAP_MS } : null,
    )
  } catch (noteErr) {
    console.error(`[shop] could not note a failed email on order ${orderId}`, noteErr)
    return
  }
  if (retrying) await kickEmailRetry()
}

/** A newer email about this parcel is going: the unsent older ones it makes
 *  out of date are dropped, so a retry cannot deliver stale news after it. */
export async function dropReplacedEmails(orderId: string, shipmentId: string, trigger: string): Promise<void> {
  try {
    for (const note of await openEmailsForShipment(orderId, shipmentId, triggersReplacedBy(trigger))) {
      if (note.failedEmail) await settleEmailNote(note.id, replacedNoteText(note.failedEmail))
    }
  } catch (error) {
    console.error(`[shop] could not drop replaced emails on order ${orderId}`, error)
  }
}

function attachmentsOf(email: FailedOrderEmail): EmailAttachment[] | undefined {
  return email.attachments?.length
    ? email.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.contentBase64, 'base64'), contentType: a.contentType }))
    : undefined
}

/**
 * One try of one held note: send it as written, and settle or reschedule.
 * A manual try that fails starts the five minutes again - whoever pressed
 * Resend wanted it to go.
 */
async function sendHeldNote(note: OrderNoteRow, orderId: string, manual: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = note.failedEmail
  if (!email) return { ok: false, error: 'Nothing here to resend.' }
  const attachments = attachmentsOf(email)
  try {
    await sendEmail({
      moduleName: 'shop',
      ...threadKeyFor(email.trigger, orderId),
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(attachments ? { attachments } : {}),
    })
  } catch (err) {
    const reason = failureReason(err)
    const restart = manual && canRetryEmails()
    const after = await recordFailedTry(note.id, reason, { gapMs: RETRY_GAP_MS, restartForMs: restart ? RETRY_FOR_MS : null })
    if (after) {
      const still = after.emailNextTryAt !== null
      await setEmailNoteContent(note.id, still ? retryingNoteText(email, reason, after.emailTries) : failedNoteText(email, reason, after.emailTries))
      if (still && restart) await kickEmailRetry()
    }
    return { ok: false, error: reason || 'The email service refused it.' }
  }

  await settleEmailNote(note.id, sentNoteText(email, note.emailTries + 1))
  await logOrderEmail(orderId, email.subject, email.to, email.trigger)
  // The window the customer has now actually read (migration 072), so a
  // later save is judged against it - see maybeSendSlotEmail.
  if (email.shipmentId && email.toldWindow) await recordToldWindow(email.shipmentId, orderId, email.toldWindow)
  return { ok: true }
}

/** A Resend click on one failed note. */
export async function resendHeldEmail(orderId: string, noteId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const note = await claimNoteForResend(noteId, orderId, LEASE_MS)
  if (!note) return { ok: false, status: 409, error: 'That email has already gone, or is being sent right now.' }
  const outcome = await sendHeldNote(note, orderId, true)
  return outcome.ok ? outcome : { ok: false, status: 502, error: outcome.error }
}

/** Start the next link. False when the site cannot run one, or it did not
 *  answer - the note then still offers Resend. */
export async function kickEmailRetry(): Promise<boolean> {
  const env = cronCallEnvironment()
  if ('error' in env) return false
  try {
    const res = await fetch(`${env.siteUrl}${ROUTE}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.secret}` },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    await res.body?.cancel().catch(() => {})
    return res.ok
  } catch (error) {
    console.error('[shop] could not start the email retry', error)
    return false
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** One link of the chain. See the top of this file. */
export async function runRetryLink(): Promise<void> {
  const deadline = Date.now() + LINK_BUDGET_MS
  for (;;) {
    for (const note of await stopExpiredRetries()) {
      if (note.failedEmail) {
        await setEmailNoteContent(note.id, failedNoteText(note.failedEmail, note.failedEmail.lastError ?? '', note.emailTries))
      }
    }

    const due = await claimDueRetries(LEASE_MS, LINK_BATCH)
    if (due.length > 0) {
      // The successor goes first: this link may spend the rest of its life on
      // one send, and the chain must outlive it.
      await kickEmailRetry()
      await Promise.all(due.map((note) => sendHeldNote(note, note.orderId, false).catch((error) => {
        console.error('[shop] email retry failed', note.id, error)
      })))
      return
    }

    const wait = await msUntilNextRetry()
    if (wait === null) return
    const left = deadline - Date.now()
    if (wait > left) {
      await sleep(Math.max(0, left))
      await kickEmailRetry()
      return
    }
    await sleep(wait)
  }
}
