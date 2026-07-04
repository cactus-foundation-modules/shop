// In-memory IP rate limiter for the shop module's public mutating routes
// (reviews, back-in-stock, coupon apply). Deliberately not table-backed like
// contact-form's - those tables carry a natural IP column already; adding one
// purely for rate-limiting to shp_reviews/shp_back_in_stock_subscriptions
// would be a schema change for a non-critical last line of defence. Per-instance
// only (resets on cold start, not shared across serverless instances) - an
// acceptable tradeoff for a secondary guard behind normal validation.

type Bucket = { count: number; windowStart: number }
const buckets = new Map<string, Bucket>()

export function checkInMemoryRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now })
    return true
  }
  if (bucket.count >= maxAttempts) return false
  bucket.count += 1
  return true
}

export function getClientIpFromRequest(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'
}
