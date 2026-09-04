import { getShopConfigCached } from '@/modules/shop/lib/config'
import { orderTrackingRootSlug, TRACK_ORDER_PATH } from '@/modules/shop/lib/order-tracking'

// Paths no search engine has any business indexing. None of them mean anything
// to a visitor arriving cold - a basket belongs to whoever filled it, a checkout
// step is mid-transaction, and a confirmation page is one order's receipt - and
// an indexed one is a crawler wandering through the buying flow. Disallowed even
// on an open shop, which the old rule did not do: it only ever hid the whole
// shop when the shop was shut.
const NEVER_INDEXED = [
  '/shop/cart', '/shop/checkout', '/shop/account', '/shop/downloads', '/shop/orders',
  // The order tracker, and every order-shaped address under it. The form itself
  // gives nothing away, but the addresses in the emails carry an order number
  // and a signed token, and a crawler that has been forwarded one has no
  // business putting it in an index.
  TRACK_ORDER_PATH,
]

// Scanned by scripts/generate-module-router.mjs (mirrors lib/sitemap.ts).
export async function getPublicRobotsDisallow(): Promise<string[]> {
  const config = await getShopConfigCached()
  // A closed shop hides everything, so the finer list is redundant there.
  if (config.shopStatus === 'CLOSED') return ['/shop']

  // The tracker's second address, where the owner has given it one at the root
  // of the site. Read from the same place the page and the claim read it, so a
  // renamed slug is disallowed under its new name and not its old one.
  const rootSlug = orderTrackingRootSlug(config)
  return rootSlug ? [...NEVER_INDEXED, `/${rootSlug}`] : [...NEVER_INDEXED]
}
