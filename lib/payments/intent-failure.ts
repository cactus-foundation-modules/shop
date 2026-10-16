// What the checkout says when a payment provider cannot start a payment.
//
// provider.createIntent talks to somebody else's API, and that API can refuse
// for reasons that are the owner's to fix (a rejected key, a switched-off
// account) or that are nobody's fault (a timeout). Left uncaught the route
// answered with an empty 500, the checkout's res.json() choked on it, and a
// shopper in Safari was shown "The string did not match the expected pattern."
// - which names nothing and tells nobody what to do.
//
// Two outcomes, and the line between them is deliberate:
//
//  - A provider that has thrown an error written FOR the shopper ("Pay by bank
//    is only available for orders priced in GBP.") marks it `shopperSafe`, and
//    that sentence is passed on as it is.
//  - Anything else is logged in full and answered with one plain sentence. A
//    provider's raw error text is for the owner and the logs: it can name keys,
//    account settings and upstream error codes, none of which belong on a
//    shopper's screen.
//
// `shopperSafe` is a flag rather than an exported class so a module can opt in
// without importing anything from shop.
import { NextResponse } from 'next/server'

export const INTENT_FAILURE_MESSAGE =
  'We could not start this payment. Please try another payment method, or try again in a few minutes.'

export type ShopperSafeError = Error & { shopperSafe: true }

/** Build an error whose message may be shown to a shopper as written. */
export function shopperSafeError(message: string): ShopperSafeError {
  return Object.assign(new Error(message), { shopperSafe: true as const })
}

export function isShopperSafeError(err: unknown): err is ShopperSafeError {
  return err instanceof Error && (err as { shopperSafe?: unknown }).shopperSafe === true && err.message.trim() !== ''
}

export function describeIntentFailure(err: unknown): { status: number; message: string } {
  if (isShopperSafeError(err)) return { status: 400, message: err.message }
  // 503, never 502 or 504: a CDN in front of the site (Cloudflare on any plan
  // short of Enterprise) swaps an origin's 502/504 body for its own HTML error
  // page, and the shopper was back to Safari's "The string did not match the
  // expected pattern." with the sentence below thrown away. A 503 passes
  // through as written.
  return { status: 503, message: INTENT_FAILURE_MESSAGE }
}

/** The JSON answer for a provider that could not start a payment. Logs the real
 *  error first, because the message the shopper gets deliberately does not
 *  carry it. */
export function intentFailureResponse(providerId: string, err: unknown): NextResponse {
  console.error(`[shop] payment method ${providerId} could not start a payment`, err)
  const { status, message } = describeIntentFailure(err)
  return NextResponse.json({ error: message }, { status })
}
