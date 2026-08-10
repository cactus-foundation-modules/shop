import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'

// Whether the person looking at a storefront page is staff who may be shown the
// shop's own buying codes on it - the sale SKU a supplier's clearance stock is
// ordered under, and the chosen variation's own SKU. A shopper is shown neither:
// the sale code is a private supplier reference, and a variation's code is a
// picking detail nobody buying a chair has any use for.
//
// Same bar as the stock figure (lib/admin-stock.ts) and for the same reason:
// these are reads, and a colleague with read-only shop access already sees every
// one of them in the admin product list. Nobody signed out gets any of it - the
// codes are never in a public page's markup, nor in the payload behind it.
//
// Costs an anonymous visitor nothing: getSessionFromCookie short-circuits on a
// missing cookie before it reaches the database, and it is React-cached, so a
// signed-in admin rides on the session lookup the public render already makes.
export async function canSeeProductCodes(): Promise<boolean> {
  const user = await getSessionFromCookie()
  if (!user) return false
  return hasShopPermission(user, 'shop.products', { allowAccess: true })
}
