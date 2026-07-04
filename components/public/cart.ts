'use client'

// Client-side cart: localStorage only, server revalidates on every checkout
// step (Q9 - no shp_carts table, no abandoned-cart tracking in v0.1.0).

export type CartLine = { productId: string; quantity: number }

const STORAGE_KEY = 'cactus_shop_cart'
const CART_EVENT = 'cactus-shop-cart-changed'

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

export function addToCart(productId: string, quantity: number): void {
  const lines = getCart()
  const existing = lines.find((l) => l.productId === productId)
  if (existing) existing.quantity += quantity
  else lines.push({ productId, quantity })
  persist(lines)
}

export function setLineQuantity(productId: string, quantity: number): void {
  const lines = getCart()
  if (quantity <= 0) {
    persist(lines.filter((l) => l.productId !== productId))
    return
  }
  const existing = lines.find((l) => l.productId === productId)
  if (existing) existing.quantity = quantity
  else lines.push({ productId, quantity })
  persist(lines)
}

export function removeFromCart(productId: string): void {
  persist(getCart().filter((l) => l.productId !== productId))
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
