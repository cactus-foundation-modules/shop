import type { ShopGridWindow } from '@/modules/shop/lib/grid-page-types'

// The one rule that keeps on-demand paging from being a hole: which of the
// products a caller asked for it actually gets back.
//
// Pure, and in a file of its own with no database anywhere behind it, because
// this is the rule worth pinning with tests. Getting the arithmetic wrong shows
// up as a grid that quietly stops growing - a page that looks finished when it
// is not - and getting the id filtering wrong would let a browser name a product
// this grid was never over.

/** The products a window asks for, in the window's own order, dropping anything
 *  the caller's own query did not return.
 *
 *  `products` is always the authorising query's result, so it is already capped
 *  at the block's ceiling; `maxCards` is what one call may render, which is the
 *  block's page size. There is no second HARD_MAX clamp here on purpose - the
 *  list this picks from cannot be longer than the query that produced it. */
export function pickWindow<T extends { id: string }>(
  products: readonly T[],
  window: ShopGridWindow,
  maxCards: number,
): T[] {
  const cap = Math.max(1, Math.floor(Number(maxCards)) || 1)
  if ('ids' in window) {
    const byId = new Map(products.map((p) => [p.id, p]))
    // The caller's order is kept and its unknowns are dropped - never the other
    // way round. An id the query did not return is not an error to report, it is
    // a product this grid cannot show, and answering "that one exists but not
    // here" would answer a question the asker has no business asking.
    return window.ids.slice(0, cap).map((id) => byId.get(id)).filter((p): p is T => p != null)
  }
  const offset = Math.max(0, Math.floor(Number(window.offset)) || 0)
  const count = Math.min(cap, Math.max(1, Math.floor(Number(window.count)) || 1))
  return products.slice(offset, offset + count)
}
