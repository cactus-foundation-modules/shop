import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { shopClosedResponse } from '@/modules/shop/lib/access'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getMemberFromCookie } from '@/lib/members/session'
import { findOrdersByNumberCandidates, getOrderById } from '@/modules/shop/lib/db/orders'
import {
  clearOrderAccessFailures,
  getOrderAccessLock,
  recordOrderAccessFailure,
  sweepOrderAccessAttempts,
} from '@/modules/shop/lib/db/order-access'
import { orderNumberCandidates, postcodeMatches } from '@/modules/shop/lib/order-lookup'
import { grantGuestOrderAccess, guestOrderAccessIdsFromRequest } from '@/modules/shop/lib/guest-order-access'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'
import type { ShpOrder } from '@/modules/shop/lib/types'

// PUBLIC - a shopper with no account proving that an order is theirs.
//
// The only way into a guest's own order page, and therefore the only thing
// standing between a stranger and somebody's delivery address. Three guards,
// each covering what the others cannot:
//
//   1. the postcode itself, which is what the customer knows and the stranger
//      does not,
//   2. an IP limiter, which stops one machine going quickly,
//   3. a per-ORDER lockout in the database (lib/db/order-access.ts), which stops
//      many machines going slowly at one order - the IP limiter cannot, because
//      it is per-instance and keyed on something the guesser chooses.
//
// Every unsuccessful answer is the same sentence, whatever went wrong: an order
// number that does not exist, a postcode that does not match and an order
// belonging to somebody else must be indistinguishable, or the failures
// themselves become a way of finding out which order numbers are real.

const Body = z.object({
  /** As typed. Any capitalisation, any spacing, with or without the shop's
   *  prefix - see lib/order-lookup.ts. */
  orderNumber: z.string().max(64).optional(),
  /** The other way in: somebody who followed a link straight to an order page
   *  and was asked to prove themselves there. The page already knows which
   *  order it is, so there is nothing for them to type but the postcode. */
  orderId: z.string().max(64).optional(),
  postcode: z.string().min(1).max(32),
})

/** One sentence for every kind of failure. See the note above. */
const NO_MATCH = 'We could not find an order with that number and postcode. Check both and try again.'

/** Rows are swept on roughly one attempt in fifty rather than on a timer, the
 *  same amortised trick lib/rate-limit.ts uses on its own buckets. */
const SWEEP_ODDS = 50

export async function POST(request: NextRequest) {
  const closed = await shopClosedResponse()
  if (closed) return closed

  const config = await getShopConfigCached()
  if (!config.guestOrderTrackingEnabled) {
    return NextResponse.json({ error: 'Order tracking is not available on this shop.' }, { status: 404 })
  }

  if (!checkInMemoryRateLimit(`order-track:${getClientIpFromRequest(request)}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts, please try again in a little while.' }, { status: 429 })
  }

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: NO_MATCH }, { status: 400 })

  const { orderId, orderNumber, postcode } = parsed.data

  // Which order is being asked about. An id comes from a page that already knew;
  // a number comes from somebody typing, and could mean more than one thing on a
  // shop whose numbering has changed - in which case we ask rather than guess.
  let order: ShpOrder | null = null
  if (orderId) {
    order = await getOrderById(orderId)
  } else {
    const candidates = orderNumberCandidates(orderNumber ?? '', config.orderNumberPrefix)
    const matches = await findOrdersByNumberCandidates(candidates)
    if (matches.length > 1) {
      return NextResponse.json(
        { error: 'More than one order matches that. Please type the order number in full, exactly as it appears in your email.' },
        { status: 400 },
      )
    }
    order = matches[0] ?? null
  }

  // Deliberately not "no such order". See the note at the top.
  if (!order) return NextResponse.json({ error: NO_MATCH }, { status: 404 })

  const lock = await getOrderAccessLock(order.id)
  if (lock.locked) {
    return NextResponse.json(
      {
        error: 'Too many attempts on this order. Please try again in a little while, or get in touch and we will help.',
        retryAfterSeconds: lock.retryAfterSeconds,
      },
      { status: 429 },
    )
  }

  if (!postcodeMatches(postcode, order.shippingAddress.postcode)) {
    const now = await recordOrderAccessFailure(order.id)
    if (Math.floor(Math.random() * SWEEP_ODDS) === 0) {
      await sweepOrderAccessAttempts().catch(() => {})
    }
    return NextResponse.json(
      now.locked
        ? {
            error: 'Too many attempts on this order. Please try again in a little while, or get in touch and we will help.',
            retryAfterSeconds: now.retryAfterSeconds,
          }
        : { error: NO_MATCH },
      { status: now.locked ? 429 : 404 },
    )
  }

  // Proved. Anything counted against them is forgotten, so the next visit starts
  // clean rather than one wrong guess from a lockout.
  await clearOrderAccessFailures(order.id)

  const path = `/shop/account/orders/${order.id}`
  const response = NextResponse.json({ orderId: order.id, orderNumber: order.orderNumber, path })

  // A signed-in owner needs no cookie - their session already opens this order,
  // and writing one would only hand their browser a second key to an order they
  // keep in their account anyway.
  const member = await getMemberFromCookie()
  if (member && order.memberId === member.id) return response

  grantGuestOrderAccess(response, order.id, guestOrderAccessIdsFromRequest(request))
  return response
}
