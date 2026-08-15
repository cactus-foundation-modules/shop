'use client'

// Client-side cart: localStorage, read synchronously, no round-trip to render -
// and for a guest that is still the whole story. The server revalidates on every
// checkout step, so nothing stored here is ever trusted for price or stock.
//
// A signed-in shopper additionally gets the basket kept on the server, so one
// started on a phone is waiting on the laptop. That lives entirely in cart-sync,
// which merges on sign-in, pushes on change and pulls when a tab comes back to
// the front. This file stays the single place the basket is read and written;
// sync only ever hands it a new set of lines through applyServerCart.
//
// A line may carry `meta`: per-line personalisation (engraving text, chosen
// options, upload tokens) captured at add-to-cart. Personalised lines get a
// client-generated `lineId` so two of the same product with different options
// never merge; the server prices the meta authoritatively at checkout. Plain
// lines have no lineId/meta and merge by productId exactly as before.

// Imports back from cart-sync, which imports from here. The cycle is deliberate
// and harmless: both sides export nothing but hoisted function declarations, and
// neither runs anything at module scope that touches the other.
import { ensureCartSync } from '@/modules/shop/components/public/cart-sync'

export type CartLine = { productId: string; quantity: number; lineId?: string; meta?: Record<string, unknown> }

const STORAGE_KEY = 'cactus_shop_cart'
const CART_EVENT = 'cactus-shop-cart-changed'
// Fired only by addToCart, on top of the change event every write fires. An add
// is the one cart write that deserves a reaction of its own (the slide-out
// basket opens itself on it); a quantity nudge or a removal inside the panel
// must not, so those keep to CART_EVENT alone.
const CART_ADD_EVENT = 'cactus-shop-cart-added'

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

// The basket held in memory, used only when localStorage cannot be written.
//
// localStorage.setItem THROWS in Safari's private browsing and when a device's
// quota is full, and the throw came straight back out of addToCart - so the Add
// to basket button did nothing, said nothing and left no trace, for a shopper
// whose only mistake was opening a private window.
//
// Swallowing the throw is not enough on its own: every cart surface re-reads
// through getCart when the change event fires, so a basket that failed to store
// would read back as the previous one and the button would still look broken.
// So the lines are kept here as well, and getCart prefers them once the store
// has proved unwritable. The basket then works normally for the visit and is
// simply gone on reload, which is the most a browser refusing to store anything
// will allow - and is a great deal better than a button that does nothing.
let memoryCart: CartLine[] | null = null

export function getCart(): CartLine[] {
  if (typeof window === 'undefined') return []
  if (memoryCart) return memoryCart
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
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
    // A store that started working again (quota freed) hands the basket back.
    memoryCart = null
  } catch {
    memoryCart = lines
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT))
}

// Plain add: addToCart(id, qty). Personalised add: pass { meta } (and optionally
// a caller-computed stable lineId so re-adding an identical selection merges
// rather than stacking). Personalised lines never merge into plain ones.
//
// The line just added always ends up first in the cart, whether it was new or an
// existing line taking on more quantity - a shopper who adds something wants to
// see it, not scroll a long basket hunting for what changed.
export function addToCart(
  productId: string,
  quantity: number,
  opts?: { lineId?: string; meta?: Record<string, unknown> },
): void {
  const lines = getCart()
  const personalised = Boolean(opts?.meta || opts?.lineId)
  const lineId = opts?.lineId
  const existingIndex = personalised
    ? lineId
      ? lines.findIndex((l) => l.lineId === lineId)
      : -1
    : lines.findIndex((l) => l.productId === productId && !l.lineId)
  const existing = existingIndex >= 0 ? lines[existingIndex] : undefined
  if (existing) {
    lines.splice(existingIndex, 1)
    existing.quantity += quantity
    lines.unshift(existing)
  } else if (personalised) {
    lines.unshift({ productId, quantity, lineId: lineId ?? newLineId(), meta: opts?.meta })
  } else {
    lines.unshift({ productId, quantity })
  }
  persist(lines)
  window.dispatchEvent(new CustomEvent(CART_ADD_EVENT))
  ensureCartSync()
}

// Sync's one way in: replaces the basket wholesale with what the member's other
// device left on the server. Goes through persist like every other write, so
// every cart surface refreshes from the one event they already listen to.
export function applyServerCart(lines: CartLine[]): void {
  if (typeof window === 'undefined') return
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

// Merges values into a line's meta bag - used by generic per-line cart controls
// (a delivery-tier picker, say) that a cart-line resolver offered. A plain line
// has no lineId, so it is given one on first write: its meta now distinguishes
// it, and it must key and target independently, exactly like a personalised add.
export function setLineMeta(key: string, meta: Record<string, unknown>): void {
  const lines = getCart()
  const existing = lines.find((l) => cartLineKey(l) === key)
  if (!existing) return
  existing.meta = { ...existing.meta, ...meta }
  if (!existing.lineId) existing.lineId = newLineId()
  persist(lines)
}

export function removeFromCart(key: string): void {
  persist(getCart().filter((l) => cartLineKey(l) !== key))
}

// Removes a set of lines in one write - a grouped removal (a product and its
// accessories together) must not fire a persist, a change event and a sync push
// per line when one of each covers the lot.
export function removeCartLines(keys: readonly string[]): void {
  const set = new Set(keys)
  persist(getCart().filter((l) => !set.has(cartLineKey(l))))
}

// Puts a removed line back exactly as it was - same quantity, same meta, same
// place in the cart - so the cart's undo really is an undo rather than a fresh
// add. `index` is where the line sat before it went; a cart that has moved on
// since (the line re-added by hand, say) is left alone.
export function restoreCartLine(line: CartLine, index: number): void {
  const lines = getCart()
  if (lines.some((l) => cartLineKey(l) === cartLineKey(line))) return
  const at = Math.max(0, Math.min(index, lines.length))
  lines.splice(at, 0, line)
  persist(lines)
}

// The multi-line undo: puts a removed set back exactly where each line sat, in
// one write (same batching argument as removeCartLines). Lines that have since
// been re-added by hand are left alone, exactly as restoreCartLine skips them.
export function restoreCartLines(snapshots: readonly { line: CartLine; index: number }[]): void {
  const lines = getCart()
  const present = new Set(lines.map((l) => cartLineKey(l)))
  // Ascending by original index, so each splice lands against a list that
  // already has the earlier lines back in it and every line regains its place.
  const ordered = [...snapshots].sort((a, b) => a.index - b.index)
  let changed = false
  for (const { line, index } of ordered) {
    if (present.has(cartLineKey(line))) continue
    const at = Math.max(0, Math.min(index, lines.length))
    lines.splice(at, 0, line)
    present.add(cartLineKey(line))
    changed = true
  }
  if (changed) persist(lines)
}

export function clearCart(): void {
  persist([])
}

export function subscribeCart(callback: () => void): () => void {
  ensureCartSync()
  window.addEventListener(CART_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(CART_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

// Adds only, in this tab only. Deliberately not wired to `storage`: a shopper
// adding something in another tab should not have a panel fly open over the page
// they are reading in this one.
export function subscribeCartAdd(callback: () => void): () => void {
  window.addEventListener(CART_ADD_EVENT, callback)
  return () => window.removeEventListener(CART_ADD_EVENT, callback)
}
