// Shared browser-side reader for the shop's public config
// (GET /api/m/shop/public/config).
//
// Every client surface that needs shop-wide settings - the currency symbol,
// where product pages live, whether the shop is transacted with by basket or by
// quote, which payment methods exist - comes through here.
//
// It used to be a bare fetch per component, seventeen of them, none aware of
// the others. A checkout page mounts eight of those components at once, so a
// single page load asked the server for the same shop-wide settings eight times
// over, and each answer costs several database round trips. That was enough to
// make this one route out-invoke every other route on the site four to one, and
// it left a burst from a single browser able to exhaust the database connection
// pool and take unrelated pages down with it.
//
// So: at most one request in flight, its answer handed to every caller that
// asks while it is running, and held for a moment afterwards. Eight calls
// become one.
//
// The hold is deliberately short, and matches the five seconds the server
// already holds this payload for. Nothing here makes the answer staler than it
// was before - it only stops the same answer being asked for eight times.

const HOLD_MS = 5_000

// The payload is whatever the /config route returns, and that grows a field
// every time a setting does. Typing it exhaustively here would mean a second
// copy of that list to keep in step, and a caller reading a field this file had
// not caught up with would fail to compile for no reason worth having. Callers
// that want real types pass their own shape as the type argument instead - see
// CheckoutPaymentClient.
export type ShopPublicConfig = Record<string, any>

let cachedValue: unknown = null
let cachedAt = 0
let inFlight: Promise<unknown> | null = null

async function load(): Promise<unknown> {
  const res = await fetch('/api/m/shop/public/config')
  if (!res.ok) return null
  return res.json()
}

export function fetchShopPublicConfig<T = ShopPublicConfig>(): Promise<T | null> {
  if (cachedValue !== null && Date.now() - cachedAt < HOLD_MS) {
    return Promise.resolve(cachedValue as T)
  }
  if (inFlight) return inFlight as Promise<T | null>

  const request = load()
    .then((value) => {
      // A failed read is not held. The next caller should get a fresh attempt
      // rather than five seconds of a null nobody can account for.
      if (value !== null && value !== undefined) {
        cachedValue = value
        cachedAt = Date.now()
      }
      return value ?? null
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null
    })

  inFlight = request
  return request as Promise<T | null>
}

// Drops the held answer, so the next read goes back to the server. For the
// admin side, where the owner has just saved a setting and the page they are
// looking at should show what they saved rather than what was true a moment ago.
export function invalidateShopPublicConfig(): void {
  cachedValue = null
  cachedAt = 0
}
