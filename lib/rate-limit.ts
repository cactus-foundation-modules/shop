import { clientIpFromHeaders } from '@/lib/auth/rate-limit'

// In-memory IP rate limiter for the shop module's public mutating routes
// (back-in-stock, coupon apply). Deliberately not table-backed like
// contact-form's - those tables carry a natural IP column already; adding one
// purely for rate-limiting to shp_back_in_stock_subscriptions
// would be a schema change for a non-critical last line of defence. Per-instance
// only (resets on cold start, not shared across serverless instances) - an
// acceptable tradeoff for a secondary guard behind normal validation.

type Bucket = { count: number; windowStart: number; expiresAt: number }
const buckets = new Map<string, Bucket>()

// A bucket is only interesting until its window closes, but nothing ever came
// back to remove the closed ones: one entry per address per route, kept for the
// life of the instance. A long-lived box quietly accumulated every visitor it
// had ever throttled. Swept in amortised fashion - on the write that crosses the
// mark, not on a timer - so this stays a plain module with no lifecycle.
const SWEEP_EVERY = 512
let writesSinceSweep = 0

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.expiresAt <= now) buckets.delete(key)
  }
}

export function checkInMemoryRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now()
  if (++writesSinceSweep >= SWEEP_EVERY) {
    writesSinceSweep = 0
    sweep(now)
  }
  const bucket = buckets.get(key)
  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now, expiresAt: now + windowMs })
    return true
  }
  if (bucket.count >= maxAttempts) return false
  bucket.count += 1
  return true
}

/**
 * @deprecated Use `getClientIp()` from `@/lib/auth/rate-limit` - every caller in
 * this module and the shop add-ons now does. Kept only because an add-on module
 * an install has not updated yet may still import it, and removing it would
 * break that install's build.
 *
 * This used to return the LEFTMOST x-forwarded-for entry, which is whatever the
 * caller typed: rotate it per request and every per-IP limit here was walked
 * straight through. Now the last hop (the one the platform appended), via
 * core's own parser. What it cannot do synchronously is honour the owner's
 * "behind Cloudflare" setting - there, every visitor shares Cloudflare's
 * address, so a stale caller over-limits rather than under-limits until it is
 * updated. That is the safe way round.
 */
export function getClientIpFromRequest(req: Request): string {
  return clientIpFromHeaders((name) => req.headers.get(name))
}
