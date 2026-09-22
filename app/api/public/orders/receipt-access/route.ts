import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getOrderByNumber } from '@/modules/shop/lib/db/orders'
import {
  clearOrderAccessFailures,
  getOrderAccessLock,
  recordOrderAccessFailure,
  sweepOrderAccessAttempts,
} from '@/modules/shop/lib/db/order-access'
import { verifyOrderReceiptToken } from '@/modules/shop/lib/order-receipt-token'
import {
  receiptAnswerMatches,
  receiptChallengeFor,
  receiptEmailMatches,
} from '@/modules/shop/lib/order-receipt-challenge'
import { grantGuestOrderAccess, guestOrderAccessIdsFromRequest } from '@/modules/shop/lib/guest-order-access'
import { grantReceiptAccess } from '@/modules/shop/lib/receipt-access-cookie'
import { checkInMemoryRateLimit } from '@/modules/shop/lib/rate-limit'
import { getClientIp } from '@/lib/auth/rate-limit'

// PUBLIC - proving that a receipt is yours, on a browser that has not proved it.
//
// The only way into the confirmation page's order data other than having bought
// the thing on this machine, and deliberately a POST: what is typed here is a
// secret, and a secret in a query string ends up in the site's access logs, in
// browser history and in the Referer header sent to every third party the next
// page loads. That is the whole reason the order status route no longer takes
// an `?email=`; putting the replacement in a URL would have moved the problem
// rather than fixed it.
//
// Two kinds of caller, and the difference is how much may be said back:
//
//   with a token   - the shop's own confirmation link. It proves the order
//                    exists, so the answer wanted can be named (the delivery
//                    postcode, or the email address on an order that has no
//                    postcode - see lib/order-receipt-challenge.ts) and a wrong
//                    answer can be told apart from a wrong link.
//   without one    - the old order-number-and-email lookup, which is all a
//                    customer reading an order number off a printed note has.
//                    Nothing may be named here: an order number is a prefix and
//                    a sequence, so every failure gets one wording or the
//                    failures themselves become a way of finding real orders.
//
// The order page's postcode gate (app/api/public/orders/track) is a third door
// on the same question, and is left alone: it is the front of the shop's guest
// tracking feature, it can be switched off by the owner, and it answers with
// somewhere to navigate to. A shop with tracking off still hands out
// confirmation links and still has customers opening them on the other machine.
//
// Same three guards as that tracker, because the thing being protected is the
// same: the answer itself, the per-IP limiter (fast guessing from one machine)
// and the per-ORDER lockout in the database (slow guessing from many). See
// lib/db/order-access.ts - the lockout is shared with the tracker deliberately,
// so a guesser cannot get eight fresh attempts simply by switching doors.

const Body = z.object({
  orderNumber: z.string().min(1).max(64),
  /** The signed receipt token off the confirmation link, where the caller has
   *  one. Proves which order is being asked about; proves nothing at all about
   *  who is asking. */
  token: z.string().min(1).max(256).optional(),
  /** With a token: the delivery postcode, or the email address on an order that
   *  has no postcode. Without one: the email address the order was placed with. */
  answer: z.string().min(1).max(128),
})

const NO_MATCH_POSTCODE = 'That is not the delivery postcode for this order. Check it and try again.'
const NO_MATCH_EMAIL = 'That is not the email address this order was placed with. Check it and try again.'
/** One sentence for every kind of failure on the token-less door. See above. */
const NO_MATCH_LOOKUP = 'We could not find an order with that number and email address. Check both and try again.'
const LOCKED = 'Too many attempts on this order. Please try again in a little while, or get in touch and we will help.'

/** Rows are swept on roughly one attempt in fifty rather than on a timer, the
 *  same amortised trick lib/rate-limit.ts uses on its own buckets. */
const SWEEP_ODDS = 50

// Deliberately NOT behind the shop gate: proving a receipt is yours is
// post-purchase, and stays open while the shop is closed (see getShopGate in
// lib/access.ts). The guards above are what protect it, and they still apply.
export async function POST(request: NextRequest) {
  if (!checkInMemoryRateLimit(`order-receipt-access:${(await getClientIp())}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts, please try again in a little while.' }, { status: 429 })
  }

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orderNumber, token, answer } = parsed.data

  const viaToken = verifyOrderReceiptToken(orderNumber, token)

  // A token that does not check out is answered before anything is looked up, so
  // a forged one cannot become a way of asking whether an order exists.
  if (token && !viaToken) {
    return NextResponse.json({ error: NO_MATCH_LOOKUP }, { status: 404 })
  }

  const order = await getOrderByNumber(orderNumber)
  if (!order) {
    return NextResponse.json({ error: viaToken ? 'Order not found' : NO_MATCH_LOOKUP }, { status: 404 })
  }

  const lock = await getOrderAccessLock(order.id)
  if (lock.locked) {
    return NextResponse.json({ error: LOCKED, retryAfterSeconds: lock.retryAfterSeconds }, { status: 429 })
  }

  // With a link, the order itself decides what it can be opened with. Without
  // one, the only key that has ever existed is the email address it was placed
  // with - the postcode is deliberately NOT accepted here, because that door is
  // the tracker's and the owner is allowed to close it.
  const matched = viaToken
    ? receiptAnswerMatches(order, answer)
    : receiptEmailMatches(answer, order.customerEmail)

  if (!matched) {
    const now = await recordOrderAccessFailure(order.id)
    if (Math.floor(Math.random() * SWEEP_ODDS) === 0) {
      await sweepOrderAccessAttempts().catch(() => {})
    }
    if (now.locked) {
      return NextResponse.json({ error: LOCKED, retryAfterSeconds: now.retryAfterSeconds }, { status: 429 })
    }
    return NextResponse.json(
      {
        error: !viaToken
          ? NO_MATCH_LOOKUP
          : receiptChallengeFor(order) === 'postcode'
            ? NO_MATCH_POSTCODE
            : NO_MATCH_EMAIL,
      },
      { status: viaToken ? 403 : 404 },
    )
  }

  // Proved. Anything counted against them is forgotten, so the next visit starts
  // clean rather than one wrong guess from a lockout.
  await clearOrderAccessFailures(order.id)

  const response = NextResponse.json({ ok: true, orderNumber: order.orderNumber })

  // The receipt cookie opens the page they are standing on. The order-access one
  // goes with it ONLY when the postcode was what they answered: that is the
  // question the tracker asks, and withholding its answer would mean asking for
  // the same postcode again the moment they clicked through to track the parcel.
  // An email address is not that question, and must not quietly become a key to
  // the order page, its invoices and its paperwork.
  grantReceiptAccess(response, order.orderNumber, request)
  if (viaToken && receiptChallengeFor(order) === 'postcode') {
    grantGuestOrderAccess(response, order.id, guestOrderAccessIdsFromRequest(request))
  }
  return response
}
