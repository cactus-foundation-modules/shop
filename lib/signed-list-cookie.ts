// PROTECTED - the shape both of the shop's "this browser has proved something"
// cookies are written in.
//
// There are two of them and they are deliberately not one (see
// lib/receipt-access-cookie.ts for why), which is exactly the situation where
// two copies of the signing, the expiry handling and the tamper check drift
// apart - and a drifted tamper check is a cookie a browser can edit. So the
// wire format lives here once and the two files above it only decide what goes
// in the list, how long it lasts and what the cookie is called.
//
// The format: a base64url JSON payload, a dot, and an HMAC over that payload
// namespaced by a purpose string. The namespace matters - it is what stops a
// value minted for one of these cookies verifying in the other.
//
// A signed cookie rather than a row in a table, for the same reason the receipt
// token beside it is an HMAC rather than a row: nothing to sweep, no session
// table growing a line per parcel, and nothing personal written down anywhere.
import { createHmac, timingSafeEqual } from 'crypto'

type ListPayload = { o: string[]; e: number }

function getKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY is not set - required for order access cookies.')
  return key
}

function sign(purpose: string, payload: string): string {
  return createHmac('sha256', getKey()).update(`${purpose}:${payload}`).digest('base64url')
}

/** Constant-time, and false for anything malformed rather than throwing - a
 *  mangled cookie is a visitor who has to prove themselves again, not a 500. */
function signatureValid(purpose: string, payload: string, signature: string): boolean {
  try {
    const a = Buffer.from(sign(purpose, payload))
    const b = Buffer.from(signature)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** The values in a cookie, or none at all if it is unsigned, expired, tampered
 *  with, minted for a different purpose or simply not ours. Never throws. */
export function readSignedListCookie(
  purpose: string,
  value: string | null | undefined,
  max: number,
): string[] {
  if (!value) return []
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return []

  const payload = value.slice(0, dot)
  if (!signatureValid(purpose, payload, value.slice(dot + 1))) return []

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ListPayload
    if (!parsed || !Array.isArray(parsed.o) || typeof parsed.e !== 'number') return []
    // The expiry is signed as well as being the cookie's own max-age, so a
    // browser that keeps the cookie past its date does not keep the access.
    if (parsed.e * 1000 <= Date.now()) return []
    return parsed.o.filter((item): item is string => typeof item === 'string' && item.length > 0).slice(0, max)
  } catch {
    return []
  }
}

/** The cookie value carrying these, newest first. */
export function mintSignedListCookie(
  purpose: string,
  values: string[],
  maxAgeDays: number,
  max: number,
): string {
  const expires = Math.floor(Date.now() / 1000) + maxAgeDays * 24 * 60 * 60
  const body: ListPayload = { o: values.slice(0, max), e: expires }
  const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url')
  return `${payload}.${sign(purpose, payload)}`
}

/** The new one at the front, the rest behind it, no duplicates, capped. What
 *  falls off the end is whatever has gone longest without being used. */
export function withNewestFirst(value: string, existing: string[], max: number): string[] {
  return [value, ...existing.filter((item) => item !== value)].slice(0, max)
}
