import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  clearOrderAccessFailures,
  getOrderAccessLock,
  recordOrderAccessFailure,
  sweepOrderAccessAttempts,
} from '@/modules/shop/lib/db/order-access'
import { documentOrder, verifyDocumentLinkToken } from '@/modules/shop/lib/document-access'
import { receiptAnswerMatches, receiptChallengeFor } from '@/modules/shop/lib/order-receipt-challenge'
import { grantGuestOrderAccess, guestOrderAccessIdsFromRequest } from '@/modules/shop/lib/guest-order-access'
import { grantReceiptAccess } from '@/modules/shop/lib/receipt-access-cookie'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'

// PUBLIC - proving that an invoice, credit note or proforma is yours.
//
// The paperwork's own version of the receipt gate beside it, and the same three
// guards: the answer itself, the per-IP limiter and the per-ORDER lockout in the
// database (lib/db/order-access.ts), shared with every other door onto the same
// order so a guesser cannot get eight fresh attempts by switching between them.
//
// Deliberately NOT behind the shop gate, and not behind the guest-tracking
// switch either. A shop that has closed for good still has to be able to hand
// somebody their invoice, and an owner who has switched off order tracking has
// not said anything about paperwork - the alternative is a customer whose
// accountant asks for last April's invoice being told to telephone.
//
// Passing it grants the order-access cookie, which is what the pages read: the
// answer given here is the postcode, and that is exactly what the tracker asks
// for the same grant. The receipt cookie goes with it so the confirmation page
// stops asking too.

const Body = z.object({
  kind: z.enum(['invoice', 'credit-note', 'proforma']),
  number: z.string().min(1).max(64),
  /** The permanent link token off the document's own address. It says which
   *  document is being asked about and nothing about who is asking. */
  token: z.string().min(1).max(256),
  /** The delivery postcode, or the email address on an order that has none. */
  answer: z.string().min(1).max(128),
})

const NO_MATCH_POSTCODE = 'That is not the delivery postcode for this order. Check it and try again.'
const NO_MATCH_EMAIL = 'That is not the email address this order was placed with. Check it and try again.'
const LOCKED = 'Too many attempts on this order. Please try again in a little while, or get in touch and we will help.'
const NOT_FOUND = 'We could not find that document.'

/** Rows are swept on roughly one attempt in fifty rather than on a timer, the
 *  same amortised trick lib/rate-limit.ts uses on its own buckets. */
const SWEEP_ODDS = 50

export async function POST(request: NextRequest) {
  if (!checkInMemoryRateLimit(`shp-document-access:${getClientIpFromRequest(request)}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts, please try again in a little while.' }, { status: 429 })
  }

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { kind, number, token, answer } = parsed.data

  // The token first, so this route cannot be used to ask which document numbers
  // are real - they run in sequence.
  if (!verifyDocumentLinkToken(kind, number, token)) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 })
  }

  const order = await documentOrder(kind, number)
  if (!order) return NextResponse.json({ error: NOT_FOUND }, { status: 404 })

  const lock = await getOrderAccessLock(order.id)
  if (lock.locked) {
    return NextResponse.json({ error: LOCKED, retryAfterSeconds: lock.retryAfterSeconds }, { status: 429 })
  }

  if (!receiptAnswerMatches(order, answer)) {
    const now = await recordOrderAccessFailure(order.id)
    if (Math.floor(Math.random() * SWEEP_ODDS) === 0) {
      await sweepOrderAccessAttempts().catch(() => {})
    }
    if (now.locked) {
      return NextResponse.json({ error: LOCKED, retryAfterSeconds: now.retryAfterSeconds }, { status: 429 })
    }
    return NextResponse.json(
      { error: receiptChallengeFor(order) === 'postcode' ? NO_MATCH_POSTCODE : NO_MATCH_EMAIL },
      { status: 403 },
    )
  }

  // Proved. Anything counted against them is forgotten, so the next visit starts
  // clean rather than one wrong guess from a lockout.
  await clearOrderAccessFailures(order.id)

  const response = NextResponse.json({ ok: true })
  grantGuestOrderAccess(response, order.id, guestOrderAccessIdsFromRequest(request))
  grantReceiptAccess(response, order.orderNumber, request)
  return response
}
