import { randomUUID } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'

// The cookie that says which basket is yours.
//
// A random id and nothing else - no fingerprint, nothing derived from the
// shopper - so a browser that clears it is genuinely a new basket and there is
// no back door that re-identifies anybody. HttpOnly because only the server ever
// reads it, which also keeps it out of reach of a stray script on the page.
//
// Set without asking, and set whatever the shopper has told the cookie banner.
// This is the shopping-basket cookie that every cookie-law guidance names as
// strictly necessary: a basket kept for the shopper cannot work without
// something saying which basket is theirs, and the shopper asked for the basket
// by putting something in it. That exemption is earned by the cookie doing that
// job and no other, which is why the row it points at holds lines only and why
// nothing here is ever read for marketing, analytics or reminders. A module that
// wants to chase an unfinished basket still has to ask.

export const GUEST_CART_COOKIE = 'cactus_shop_cart_id'
const MAX_AGE_DAYS = 30

export function readGuestCartId(request: NextRequest): string | null {
  const value = request.cookies.get(GUEST_CART_COOKIE)?.value?.trim()
  if (!value) return null
  // Anything that is not one of ours is treated as absent rather than trusted:
  // the value goes into a query, and a UUID is the only shape we ever wrote.
  return /^[0-9a-f-]{36}$/i.test(value) ? value : null
}

export function mintGuestCartId(): string {
  return randomUUID()
}

export function setGuestCartCookie(response: NextResponse, cartId: string): void {
  response.cookies.set(GUEST_CART_COOKIE, cartId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_DAYS * 24 * 60 * 60,
  })
}

/** Dropped once the basket has been handed to a signed-in account, so signing
 *  out on a shared machine does not hand the next person the basket the last one
 *  was building. */
export function clearGuestCartCookie(response: NextResponse): void {
  response.cookies.set(GUEST_CART_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}
