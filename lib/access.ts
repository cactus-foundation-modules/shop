import { getSessionFromCookie, type SessionUser } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getShopConfigCached } from '@/modules/shop/lib/config'

export type ShopPermissionKey =
  | 'shop.access'
  | 'shop.manage'
  | 'shop.products'
  | 'shop.orders'
  | 'shop.customers'
  | 'shop.discounts'
  | 'shop.reports'

// shop.manage supersedes every other shop key. For read-style GETs, pass
// allowAccess: true so shop.access alone is sufficient too (spec Q15).
export async function hasShopPermission(
  user: SessionUser,
  key: ShopPermissionKey,
  opts?: { allowAccess?: boolean }
): Promise<boolean> {
  if (await hasPermission(user, 'shop.manage')) return true
  if (opts?.allowAccess && (await hasPermission(user, 'shop.access'))) return true
  if (key === 'shop.access') return hasPermission(user, 'shop.access')
  return hasPermission(user, key)
}

// Staff with shop access (or shop.manage) keep seeing the storefront while the
// shop is CLOSED, so they can check it before reopening. Everyone else gets the
// closed message. Reads the session cookie, so only call it on the CLOSED path
// to avoid forcing dynamic rendering of the open storefront.
export async function canPreviewClosedShop(): Promise<boolean> {
  const user = await getSessionFromCookie()
  if (!user) return false
  return hasShopPermission(user, 'shop.access', { allowAccess: true })
}

// Draft products stay off the storefront for shoppers, but staff with shop
// access need a live page while they are still working on one - same bar as
// canPreviewClosedShop, for the same reason.
export async function canPreviewDraftProducts(): Promise<boolean> {
  return canPreviewClosedShop()
}

// Staff who keep seeing products the shop hides from shoppers for being out of
// stock (see lib/stock-visibility.ts). Same bar as the closed-shop preview, for
// the same reason: this is a read of the storefront, and anyone with shop access
// already sees every sold-out product on the admin Products screen. Only called
// once the owner has actually switched hiding on, so an untouched shop never
// reads a cookie for it and never loses its cacheable public pages.
export async function canSeeHiddenOutOfStock(): Promise<boolean> {
  const user = await getSessionFromCookie()
  if (!user) return false
  return hasShopPermission(user, 'shop.access', { allowAccess: true })
}

export type ShopGate =
  | { blocked: true; message: string; staffPreview: false }
  | { blocked: false; staffPreview: boolean }

// The CLOSED check for every public storefront surface. A closed shop is closed
// everywhere, not just at /shop: gate each public page and each public data
// route with this, or the page is reachable by URL while the shop is shut (a
// product page did exactly that until v0.1.51).
//
// Staff with shop access see the whole storefront regardless, so they can walk
// it before reopening; everyone else is blocked.
//
// Everything that sells, that is - not everything a customer has already
// bought. The post-purchase surfaces are deliberately left outside this gate,
// the same call the paperwork makes (lib/document-access.ts): guest tracking
// and the order-email landing page, the receipt proof and order status behind
// the confirmation page, delivery updates and live delivery, the order pages
// in the account area, and paid-for downloads. A customer whose sofa is still
// on the lorry is owed its whereabouts however shut the shop is. Anything that
// starts a NEW order - the catalogue, the basket, the checkout - stays behind it.
export async function getShopGate(): Promise<ShopGate> {
  const config = await getShopConfigCached()
  // Only the CLOSED path reads the session cookie. On an open shop this stays
  // cookie-free, so it cannot force dynamic rendering of the live storefront.
  if (config.shopStatus !== 'CLOSED') return { blocked: false, staffPreview: false }
  if (await canPreviewClosedShop()) return { blocked: false, staffPreview: true }
  return { blocked: true, message: config.shopClosedMessage, staffPreview: false }
}

// Public API counterpart of getShopGate: returns a ready-to-return 503 carrying
// the owner's closed message when the caller may not see the shop, else null.
//   const closed = await shopClosedResponse(); if (closed) return closed
export async function shopClosedResponse(): Promise<Response | null> {
  const gate = await getShopGate()
  return gate.blocked ? errorResponse(gate.message, 503) : null
}

// The checkout's own counterpart, for the routes that price an order or make
// one. Stricter than shopClosedResponse, because BROWSE_ONLY is open for looking
// and shut for ordering; but staff with shop access still get through, whether
// the shop is closed or browse-only, for the reason they see a closed storefront
// at all - so the owner can walk the whole checkout (totals, delivery, payment)
// before letting the public back in. The session is only read when the shop is
// not open, so an open shop's checkout costs nothing extra.
export async function checkoutClosedResponse(): Promise<Response | null> {
  const config = await getShopConfigCached()
  if (config.shopStatus === 'OPEN') return null
  if (await canPreviewClosedShop()) return null
  const message = config.shopStatus === 'CLOSED' && config.shopClosedMessage.trim()
    ? config.shopClosedMessage
    : 'The shop is not currently accepting orders.'
  return errorResponse(message, 503)
}

// Shared session + permission gate for admin API routes. Returns the session
// user on success, or a ready-to-return NextResponse on failure so callers can
// just do: `const gate = await requireShopUser('shop.products'); if (gate.error) return gate.error`
export async function requireShopUser(
  key: ShopPermissionKey,
  opts?: { allowAccess?: boolean }
): Promise<{ user: SessionUser; error?: undefined } | { user?: undefined; error: Response }> {
  const user = await getSessionFromCookie()
  if (!user) return { error: errorResponse('Not authenticated', 401) }
  if (!(await hasShopPermission(user, key, opts))) {
    return { error: errorResponse('Forbidden', 403) }
  }
  return { user }
}
