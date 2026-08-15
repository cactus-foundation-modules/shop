import { getShopConfigCached } from '@/modules/shop/lib/config'

// Paths no search engine has any business indexing. None of them mean anything
// to a visitor arriving cold - a basket belongs to whoever filled it, a checkout
// step is mid-transaction, and a confirmation page is one order's receipt - and
// an indexed one is a crawler wandering through the buying flow. Disallowed even
// on an open shop, which the old rule did not do: it only ever hid the whole
// shop when the shop was shut.
const NEVER_INDEXED = ['/shop/cart', '/shop/checkout', '/shop/account', '/shop/downloads', '/shop/orders']

// Scanned by scripts/generate-module-router.mjs (mirrors lib/sitemap.ts).
export async function getPublicRobotsDisallow(): Promise<string[]> {
  const config = await getShopConfigCached()
  // A closed shop hides everything, so the finer list is redundant there.
  return config.shopStatus === 'CLOSED' ? ['/shop'] : [...NEVER_INDEXED]
}
