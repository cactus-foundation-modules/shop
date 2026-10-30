// PROTECTED - the signed stand-in for putting a customer's email in a URL.
//
// The confirmation page needs to prove which order it may show, and it used to
// do that by carrying `?orderNumber=DW000123&email=someone@example.com`. That
// address then travelled into the site's own access logs, the browser's history
// and the Referer header sent to every third party the confirmation page loads -
// which on this shop includes a chat widget. A customer's email address is not
// a URL parameter.
//
// So the page carries a token instead. It is an HMAC over the order number
// alone, which makes it:
//
//   - private: nothing personal is in the URL at all,
//   - stronger than what it replaced: order numbers are a prefix and a sequence
//     (see lib/order-number), so `email` was the whole lock and it was
//     guessable-adjacent. A 256-bit HMAC is not,
//   - free: no table, no row, no expiry to sweep - the same reasoning as the
//     back-in-stock unsubscribe token beside it, which this deliberately mirrors.
//
// Deliberately NOT time-limited. A receipt is a thing people bookmark and come
// back to, and the email-plus-order-number route it replaces never expired
// either. The guest order-lookup form still takes email + order number and is
// untouched - this is only for the link the shop hands out itself.
import { createHmac } from 'crypto'
import { signingKey, verifyWithAnyKey } from '@/lib/crypto/keyring'

// Signed with the site's active key; checked against every key it has had, so a
// link emailed before a key rotation still opens (core's lib/crypto/keyring.ts).
function getKey(): string {
  return signingKey('order confirmation links')
}

/** The token for an order's own confirmation link. */
export function signOrderReceiptToken(orderNumber: string, key: string = getKey()): string {
  return createHmac('sha256', key).update(`receipt:${orderNumber}`).digest('base64url')
}

/** Whether this token was issued for this order. Constant-time, and false for
 *  anything malformed rather than throwing - a bad link is a 404, not a 500. */
export function verifyOrderReceiptToken(orderNumber: string, token: string | null | undefined): boolean {
  if (!orderNumber || !token) return false
  return verifyWithAnyKey(token, (key) => signOrderReceiptToken(orderNumber, key))
}
