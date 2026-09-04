// PROTECTED - what a guest has proved, and for how long.
//
// A shopper who checked out without an account has nothing to sign in with, so
// the only way they can be shown their own order is to prove they are the
// person it is going to. They do that once, by typing the delivery postcode
// (see lib/order-lookup.ts), and this is where that answer is kept afterwards
// so the next click does not ask again.
//
// It is a signed cookie rather than a row in a table, for the same reasons the
// receipt token beside it is an HMAC rather than a row: nothing to sweep, no
// session table growing a line per parcel, and nothing personal written down
// anywhere. The cookie carries order ids the browser has already proved itself
// against, and a signature over them. Forge the list and the signature fails;
// steal the cookie and you have what the person sitting at that machine had,
// which is the same bargain every session cookie in the site makes.
//
// Ids, deliberately, and not "this browser is trusted". Proving one postcode
// opens one order and no other - a customer who tracks two parcels proves both.
//
// Strictly necessary in the cookie-law sense, and set without asking for the
// same reason the basket cookie is: it exists only to keep the visitor on the
// page they explicitly asked to be let into, it is read by nothing else, and
// the alternative is asking them for their postcode on every click.
import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import type { NextRequest, NextResponse } from 'next/server'

export const GUEST_ORDER_ACCESS_COOKIE = 'cactus_shop_order_access'

/** How long a proved postcode counts for. Matched to the guest basket cookie
 *  beside it, and long enough to cover the life of a delivery and the argument
 *  afterwards without a link in an old email quietly becoming a skeleton key. */
const MAX_AGE_DAYS = 30

/** How many orders one browser may hold at once. A household tracking three
 *  parcels is ordinary; a cookie carrying two hundred ids is somebody
 *  collecting them, and the oldest fall off the end rather than the header
 *  growing without limit. */
const MAX_ORDERS = 10

type AccessPayload = { o: string[]; e: number }

function getKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY is not set - required for guest order access.')
  return key
}

function sign(payload: string): string {
  return createHmac('sha256', getKey()).update(`order-access:${payload}`).digest('base64url')
}

/** Constant-time, and false for anything malformed rather than throwing - a
 *  mangled cookie is a visitor who has to type their postcode again, not a 500. */
function signatureValid(payload: string, signature: string): boolean {
  try {
    const a = Buffer.from(sign(payload))
    const b = Buffer.from(signature)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** The order ids in a cookie value, or none at all if it is unsigned, expired,
 *  tampered with or simply not ours. Never throws. */
export function readGuestOrderAccessValue(value: string | null | undefined): string[] {
  if (!value) return []
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return []

  const payload = value.slice(0, dot)
  if (!signatureValid(payload, value.slice(dot + 1))) return []

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AccessPayload
    if (!parsed || !Array.isArray(parsed.o) || typeof parsed.e !== 'number') return []
    // The expiry is signed as well as being the cookie's own max-age, so a
    // browser that keeps the cookie past its date does not keep the access.
    if (parsed.e * 1000 <= Date.now()) return []
    return parsed.o.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, MAX_ORDERS)
  } catch {
    return []
  }
}

/** The cookie value granting this browser these orders, newest first. */
function mintGuestOrderAccessValue(orderIds: string[]): string {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE_DAYS * 24 * 60 * 60
  const body: AccessPayload = { o: orderIds.slice(0, MAX_ORDERS), e: expires }
  const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url')
  return `${payload}.${sign(payload)}`
}

// Two readers because there are two kinds of caller and neither can use the
// other's: a page reads the request through next/headers, a route handler reads
// it off the NextRequest it was given.

/** From inside a server component. */
export async function guestOrderAccessIds(): Promise<string[]> {
  const store = await cookies()
  return readGuestOrderAccessValue(store.get(GUEST_ORDER_ACCESS_COOKIE)?.value)
}

/** From inside a route handler. */
export function guestOrderAccessIdsFromRequest(request: NextRequest): string[] {
  return readGuestOrderAccessValue(request.cookies.get(GUEST_ORDER_ACCESS_COOKIE)?.value)
}

/** Whether this browser has already proved itself against this one order. */
export async function hasGuestOrderAccess(orderId: string): Promise<boolean> {
  return (await guestOrderAccessIds()).includes(orderId)
}

/**
 * Writes the proof onto the response, keeping whatever the browser had already
 * proved. The new order goes to the front, so the one that falls off the end
 * when a browser reaches the limit is the one nobody has looked at for longest.
 *
 * Refreshes the expiry of the whole set, which is deliberate: somebody actively
 * tracking a new parcel is somebody who should not be asked to prove an older
 * one again halfway through.
 */
export function grantGuestOrderAccess(response: NextResponse, orderId: string, existing: string[]): void {
  const ids = [orderId, ...existing.filter((id) => id !== orderId)].slice(0, MAX_ORDERS)
  response.cookies.set(GUEST_ORDER_ACCESS_COOKIE, mintGuestOrderAccessValue(ids), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_DAYS * 24 * 60 * 60,
  })
}
