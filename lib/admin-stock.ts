import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'

// Whether the person looking at a storefront page is staff who may be shown the
// shop's own stock figures on it. A shopper is told "In stock" and no more; staff
// get the number, which is what turns a product page into somewhere the owner can
// check the shelf without opening the admin in a second tab.
//
// Read-style gate: shop.access is enough, because a stock level is a read and a
// colleague with read-only shop access already sees the same figure in the admin
// product list. Nobody signed out ever gets a number - the figure is never in a
// public page's markup.
//
// Costs an anonymous visitor nothing: getSessionFromCookie short-circuits on a
// missing cookie before it reaches the database, and it is React-cached, so a
// signed-in admin rides on the session lookup the public render already makes.
export async function canSeeStockLevels(): Promise<boolean> {
  const user = await getSessionFromCookie()
  if (!user) return false
  return hasShopPermission(user, 'shop.products', { allowAccess: true })
}
