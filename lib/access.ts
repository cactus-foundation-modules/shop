import { getSessionFromCookie, type SessionUser } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

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
