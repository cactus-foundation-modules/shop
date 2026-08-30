'use client'

// What this basket currently comes to, published by the step that works it out
// and read by the step that needs to know.
//
// The order summary asks the server for the total on every address, delivery and
// coupon change (see CheckoutReviewClient), and the payment step needs that same
// figure to know which methods this order may be paid with - a method can be
// limited to orders above or below a certain size (lib/payments/order-value-
// limits.ts). The two are separate Puck blocks in one zone with no shared React
// state, exactly as with the card-field slot next door, so the number has to
// travel between them somehow.
//
// Deliberately NOT in checkout-state.ts. That is sessionStorage, and it holds
// what the shopper has told us: a total is the server's answer, worked out from
// live prices and stock, and a stale one restored from storage on a page load
// would be used to hide a payment method on figures nobody had checked. This
// holds it in memory for the life of the page and no longer.
//
// Unknown (null) is an ordinary state, not a failure: a checkout with no
// delivery address on it has no total yet, and a custom layout may have no order
// summary block at all. Nothing is hidden while it is unknown - the route that
// creates the order applies the same rule again for real.

const EVENT = 'cactus-shop-checkout-total-changed'

let currentTotal: number | null = null

/** The total this basket comes to - VAT and delivery included, discount taken
 *  off - or null while nobody has worked one out. */
export function getCheckoutTotal(): number | null {
  return currentTotal
}

/** Called by whichever block has just had a total back from the server. Pass
 *  null when there is no longer one to speak of: an emptied basket, a refused
 *  summary. */
export function publishCheckoutTotal(total: number | null): void {
  const next = typeof total === 'number' && Number.isFinite(total) ? total : null
  if (next === currentTotal) return
  currentTotal = next
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT))
}

export function subscribeCheckoutTotal(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVENT, callback)
  return () => window.removeEventListener(EVENT, callback)
}
