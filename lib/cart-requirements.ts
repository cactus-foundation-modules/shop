// Whole-basket purchase requirements (spec: `shop.cart-requirements`). A cart-line
// resolver speaks about one line, so it cannot say "this can only be bought with
// that" - the answer only exists once every line is known. This point is the
// whole-basket counterpart, and the checkout-blocking sibling of `shop.cart-summary`.
//
// Shop stays generic: it hands a provider the resolved lines and gets back the
// lines the basket cannot be checked out with, each with the sentence to show the
// shopper and, optionally, a link to what they are missing. It never composes or
// interprets the wording. A flagged line is marked unavailable - the exact route
// the minimum-order rule takes - so the basket prints the reason beside it and the
// checkout's existing "some items are not available" gate refuses the order on the
// server as well as in the browser.
//
// A provider that throws is skipped, as the cart-summary providers are: a broken
// optional rule must not take the whole basket down. (The cost of failing open is
// a requirement not enforced; the cost of failing closed is nobody can buy
// anything.)
import type { ShpProduct } from '@/modules/shop/lib/types'
import type { ResolvedCartLine } from '@/modules/shop/lib/checkout'
import { gatherCartExtensionPoint } from '@/modules/shop/lib/line-meta'

export type CartRequirementLine = {
  product: ShpProduct
  quantity: number
}

export type CartRequirementHit = {
  // The cart line's product (the hidden child row, for a variation).
  productId: string
  reason: string
  link?: { href: string; label: string }
}

export type CartRequirementProvider = (lines: CartRequirementLine[]) => Promise<CartRequirementHit[]> | CartRequirementHit[]

const POINT = 'shop.cart-requirements'

export async function applyCartRequirements<T extends ResolvedCartLine>(lines: T[]): Promise<T[]> {
  if (lines.length === 0) return lines
  const providers = await gatherCartExtensionPoint<CartRequirementProvider>(POINT)
  if (providers.length === 0) return lines

  const input = lines.map((l) => ({ product: l.product, quantity: l.quantity }))
  const hits = new Map<string, CartRequirementHit>()
  for (const provide of providers) {
    try {
      for (const hit of await provide(input)) if (!hits.has(hit.productId)) hits.set(hit.productId, hit)
    } catch {
      // Fail open - see the header.
    }
  }
  if (hits.size === 0) return lines

  return lines.map((line) => {
    const hit = hits.get(line.product.id)
    // A line already failing for another reason keeps it: being told what else to
    // buy is no help when the thing cannot be bought at all.
    if (!hit || !line.available) return line
    return { ...line, available: false, availabilityReason: hit.reason, ...(hit.link ? { availabilityLink: hit.link } : {}) }
  })
}
