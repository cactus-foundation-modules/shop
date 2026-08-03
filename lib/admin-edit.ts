import { getSessionFromCookie } from '@/lib/auth/session'
import { getAdminPathCached } from '@/lib/config/site'
import { hasShopPermission } from '@/modules/shop/lib/access'

// The shortcut back into the editor: when the person looking at a storefront
// product page is signed in and allowed to edit products, the product name on
// that page becomes a link to the product's admin editor. Returns null for
// everyone else - a shopper is never sent the link, so the admin URL (kept
// deliberately unguessable, see lib/config/site.ts) is never published in the
// markup of a public page.
//
// Costs an anonymous visitor nothing: getSessionFromCookie short-circuits on a
// missing cookie before it reaches the database, and it is React-cached, so a
// signed-in admin rides on the session lookup the public render already makes.
// The shop.products key (not shop.access) is the gate, so a colleague with
// read-only shop access is not handed a link to an editor they cannot save in.
export async function resolveProductAdminEditHref(productId: string): Promise<string | null> {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!(await hasShopPermission(user, 'shop.products'))) return null
  const adminPath = await getAdminPathCached()
  if (!adminPath) return null
  return `/${adminPath}/m/shop/products/${productId}`
}
