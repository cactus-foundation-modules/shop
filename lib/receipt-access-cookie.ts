// PROTECTED - which browser bought this, written down at the till.
//
// The confirmation link the checkout hands out carries a signed token over the
// order number, and for a while that token was the whole lock: anybody holding
// the address saw the customer's name, their full delivery address and what
// they had spent. Receipt links travel - forwarded, pasted into a group chat,
// left in a shared browser's history, synced across a household - so the link
// alone no longer opens the receipt. This cookie is what says the browser
// asking is the browser that checked out. Any other one answers the delivery
// postcode challenge instead (lib/order-receipt-challenge.ts).
//
// Deliberately NOT the guest order access cookie beside it, which does the same
// job for the order page. Two reasons, and the second is the load-bearing one:
//
//   1. This one is granted to everybody who checks out, without their proving
//      anything, because buying something IS the proof that it was this
//      browser. The other is only ever granted to somebody who has typed the
//      postcode, and it is what opens a server-rendered page full of their
//      address and their paperwork. Handing that out at the till would be a
//      quiet widening of what a checkout grants.
//
//   2. `cactus_shop_order_access` is declared in cactus.module.json as a cache
//      bypass cookie: core never serves a shared cached page to a request
//      carrying one, because such a request might be rendering somebody's own
//      order. Granting THAT at every checkout would take every customer who has
//      ever bought anything out of the page cache for a month - the site's own
//      returning shoppers, paying for a full origin render on every product
//      page they look at afterwards. This cookie is read by nothing that
//      renders, only by the receipt routes, so it costs the cache nothing.
//
// Order numbers rather than ids, because the receipt routes are addressed by
// order number and nothing on that path ever holds an id.
//
// Strictly necessary in the cookie-law sense, and set without asking for the
// same reason the basket cookie is: it exists only to show a customer the
// receipt for the thing they have just bought, on the machine they bought it
// on, and it is read by nothing else.
import { cookies } from 'next/headers'
import type { NextRequest, NextResponse } from 'next/server'
import {
  mintSignedListCookie,
  readSignedListCookie,
  withNewestFirst,
} from '@/modules/shop/lib/signed-list-cookie'

export const RECEIPT_ACCESS_COOKIE = 'cactus_shop_receipt'

/** Namespaces the signature, so this cookie and the order-access one beside it
 *  can never be swapped for each other. */
const PURPOSE = 'receipt-access'

/** How long a receipt stays open without being asked about. Matched to the
 *  postcode proof beside it: a receipt older than a month is still perfectly
 *  reachable, it just costs one postcode - which on a link that has had a month
 *  to be forwarded around is the right way round. */
const MAX_AGE_DAYS = 30

/** How many receipts one browser may hold. A shop somebody buys from weekly is
 *  ordinary; a cookie carrying two hundred order numbers is not, and the oldest
 *  fall off the end rather than the header growing without limit. */
const MAX_ORDERS = 10

/** The order numbers in a cookie value, or none at all if it is unsigned,
 *  expired, tampered with or simply not ours. Never throws. */
export function readReceiptAccessValue(value: string | null | undefined): string[] {
  return readSignedListCookie(PURPOSE, value, MAX_ORDERS)
}

// Two readers, because there are two kinds of caller and neither can use the
// other's: a route handler reads the request it was given, a page reads through
// next/headers. The same split lib/guest-order-access.ts makes.

/** From inside a route handler. */
export function receiptAccessNumbersFromRequest(request: NextRequest): string[] {
  return readReceiptAccessValue(request.cookies.get(RECEIPT_ACCESS_COOKIE)?.value)
}

/** From inside a server component - the document pages, which have no request
 *  of their own but do have to know whether this browser bought the thing. */
export async function receiptAccessNumbers(): Promise<string[]> {
  const store = await cookies()
  return readReceiptAccessValue(store.get(RECEIPT_ACCESS_COOKIE)?.value)
}

/** Whether this browser is one that may be shown this receipt without being
 *  asked anything. */
export function hasReceiptAccess(request: NextRequest, orderNumber: string): boolean {
  return receiptAccessNumbersFromRequest(request).includes(orderNumber)
}

/**
 * Writes the grant onto the response, keeping whatever the browser already had.
 * The new order goes to the front, so the one that falls off the end when a
 * browser reaches the limit is the one nobody has looked at for longest.
 *
 * Refreshes the expiry of the whole set, which is deliberate: somebody buying
 * again is somebody who should not be asked to prove last month's order
 * halfway through its delivery.
 */
export function grantReceiptAccess(response: NextResponse, orderNumber: string, request: NextRequest): void {
  const numbers = withNewestFirst(orderNumber, receiptAccessNumbersFromRequest(request), MAX_ORDERS)
  response.cookies.set(RECEIPT_ACCESS_COOKIE, mintSignedListCookie(PURPOSE, numbers, MAX_AGE_DAYS, MAX_ORDERS), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_DAYS * 24 * 60 * 60,
  })
}
