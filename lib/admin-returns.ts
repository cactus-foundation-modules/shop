import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'

// Whether the person looking at a storefront page is staff who may be shown what
// the shop's returns policy says about this product - whether it can come back at
// all, and the wording a customer is given when it cannot.
//
// A shopper is shown none of it here. Not because it is a secret - they are told
// the moment it matters, on their own order - but because the product page is not
// where that conversation belongs, and a "no returns" line beside a buy button
// sells nothing. What this is for is the owner standing at their own page, or on
// the phone to a customer asking, who wants the answer without opening the admin
// in a second tab.
//
// Same bar as the stock figure (lib/admin-stock.ts) and the buying codes
// (lib/admin-codes.ts), and for the same reason: it is a read, and a colleague
// with read-only shop access already sees the tick in the admin product editor.
//
// Costs an anonymous visitor nothing: getSessionFromCookie short-circuits on a
// missing cookie before it reaches the database, and it is React-cached, so a
// signed-in admin rides on the session lookup the public render already makes.
export async function canSeeReturnsPolicy(): Promise<boolean> {
  const user = await getSessionFromCookie()
  if (!user) return false
  return hasShopPermission(user, 'shop.products', { allowAccess: true })
}
