// Session-scoped cache of the last server-validated cart, so a shopper landing
// back on the cart page sees their items INSTANTLY instead of a skeleton while
// the validate round-trip (products, stock, delivery resolvers) completes. The
// cached copy is display-only bootstrap data: the live validate always runs and
// replaces it, so prices/stock can only be stale for the round-trip's duration.
// sessionStorage, not localStorage: it dies with the tab, so a returning
// visitor never sees week-old prices even for a beat.

import { removeFromCart } from '@/modules/shop/components/public/cart'

const KEY = 'cactus_shop_cart_validated'

type CachedShape = {
  productId: string
  lineId?: string | null
  quantity: number
  unitPrice: number
  lineSubtotal: number
}

type CartLineShape = { productId: string; lineId?: string; quantity: number }

const keyOf = (l: { productId: string; lineId?: string | null }) => l.lineId ?? l.productId

// Single-flight cart validation: several islands (full cart, mini-cart badge)
// each re-validate on the same cart event, firing identical POSTs in the same
// beat. Concurrent callers with an identical payload now share one request and
// one parsed response. The slot clears as soon as the request settles, so this
// never caches - it only de-duplicates the simultaneous burst.
const inflightValidate = new Map<string, Promise<ValidateResponse<unknown> | null>>()

// `notes` are whole-basket lines contributed by other modules (an "everything by
// Fri 4 Sep" from a delivery module, say). Absent from an older shop's response,
// hence optional.
export type ValidateResponse<T> = { lines: T[]; notes?: { id: string; text: string }[] }

export function postCartValidate<T>(cart: CartLineShape[]): Promise<ValidateResponse<T> | null> {
  const body = JSON.stringify({ lines: cart })
  const existing = inflightValidate.get(body)
  if (existing) return existing as Promise<ValidateResponse<T> | null>
  const promise = fetch('/api/m/shop/public/cart/validate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: ValidateResponse<unknown> | null) => {
      if (data && Array.isArray(data.lines)) pruneDeadLines(cart, data.lines)
      return data
    })
    .catch(() => null)
    .finally(() => { inflightValidate.delete(body) }) as Promise<ValidateResponse<unknown> | null>
  inflightValidate.set(body, promise)
  return promise as Promise<ValidateResponse<T> | null>
}

// The validate route drops any line whose product no longer resolves (deleted,
// archived, back to draft) - everything else comes back, if only as
// available:false. Nothing used to remove those dead lines from localStorage,
// so the header badge (which counts raw storage, the only figure it can show
// before the round-trip lands) sat one high forever while the cart page,
// rendering only validated lines, looked empty. Pruning here, in the one
// validate path every cart island shares, heals the storage itself: the write
// fires the cart-changed event, every island refreshes, and the re-validate of
// the now-clean cart finds nothing more to prune.
function pruneDeadLines(sent: CartLineShape[], returned: unknown[]): void {
  const live = new Set(
    returned.map((l) => keyOf(l as { productId: string; lineId?: string | null })),
  )
  for (const line of sent) {
    if (!live.has(keyOf(line))) removeFromCart(keyOf(line))
  }
}

export function writeValidatedCartCache(lines: unknown[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(lines))
  } catch {
    // Storage full or unavailable - the cache is purely an accelerant.
  }
}

// The cached validated lines, but only when they cover the CURRENT cart exactly
// (every line present, matched by line key). A partial match returns null and
// the caller falls back to the skeleton - rendering a cart with lines missing
// reads as "my item vanished". Quantities are refreshed from the live cart and
// the line total re-derived, so a qty tweaked on another page shows correctly.
export function readValidatedCartCache<T extends CachedShape>(cart: CartLineShape[]): T[] | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as T[]
    if (!Array.isArray(cached)) return null
    const byKey = new Map(cached.map((l) => [keyOf(l), l]))
    const matched: T[] = []
    for (const line of cart) {
      const hit = byKey.get(keyOf(line))
      if (!hit) return null
      matched.push({ ...hit, quantity: line.quantity, lineSubtotal: hit.unitPrice * line.quantity })
    }
    return matched
  } catch {
    return null
  }
}
