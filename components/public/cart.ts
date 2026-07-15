'use client'

// Client-side cart: localStorage only, server revalidates on every checkout
// step (Q9 - no shp_carts table, no abandoned-cart tracking in v0.1.0).
//
// A line may carry `meta`: per-line personalisation (engraving text, chosen
// options, upload tokens) captured at add-to-cart. Personalised lines get a
// client-generated `lineId` so two of the same product with different options
// never merge; the server prices the meta authoritatively at checkout. Plain
// lines have no lineId/meta and merge by productId exactly as before.

export type CartLine = { productId: string; quantity: number; lineId?: string; meta?: Record<string, unknown> }

const STORAGE_KEY = 'cactus_shop_cart'
const CART_EVENT = 'cactus-shop-cart-changed'

// Stable identity for a line: its lineId when personalised, else its productId.
// Use this everywhere the cart UI keys/targets a line so plain and personalised
// lines both work.
export function cartLineKey(line: Pick<CartLine, 'productId' | 'lineId'>): string {
  return line.lineId ?? line.productId
}

function newLineId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    // fall through to the manual id below
  }
  return `l_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function getCart(): CartLine[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persist(lines: CartLine[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
  window.dispatchEvent(new CustomEvent(CART_EVENT))
}

// Plain add: addToCart(id, qty). Personalised add: pass { meta } (and optionally
// a caller-computed stable lineId so re-adding an identical selection merges
// rather than stacking). Personalised lines never merge into plain ones.
export function addToCart(
  productId: string,
  quantity: number,
  opts?: { lineId?: string; meta?: Record<string, unknown> },
): void {
  const lines = getCart()
  if (opts?.meta || opts?.lineId) {
    const lineId = opts.lineId
    const existing = lineId ? lines.find((l) => l.lineId === lineId) : undefined
    if (existing) existing.quantity += quantity
    else lines.push({ productId, quantity, lineId: lineId ?? newLineId(), meta: opts.meta })
  } else {
    const existing = lines.find((l) => l.productId === productId && !l.lineId)
    if (existing) existing.quantity += quantity
    else lines.push({ productId, quantity })
  }
  persist(lines)
}

// `key` is a cartLineKey (productId for plain lines, lineId for personalised).
export function setLineQuantity(key: string, quantity: number): void {
  const lines = getCart()
  if (quantity <= 0) {
    persist(lines.filter((l) => cartLineKey(l) !== key))
    return
  }
  const existing = lines.find((l) => cartLineKey(l) === key)
  if (existing) existing.quantity = quantity
  persist(lines)
}

export function removeFromCart(key: string): void {
  persist(getCart().filter((l) => cartLineKey(l) !== key))
}

export function clearCart(): void {
  persist([])
}

export function subscribeCart(callback: () => void): () => void {
  window.addEventListener(CART_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(CART_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}
