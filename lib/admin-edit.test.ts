import { describe, it, expect, vi, beforeEach } from 'vitest'

// The three doors resolveProductAdminEditHref goes through. Mocked because the
// branch logic IS the thing under test: this link carries the site's admin path,
// which is deliberately unguessable, so every "not this visitor" branch has to
// keep returning null. A later loosening (passing allowAccess, say, or dropping
// a null check) should fail here rather than on a live storefront.
vi.mock('@/lib/auth/session', () => ({ getSessionFromCookie: vi.fn() }))
vi.mock('@/lib/config/site', () => ({ getAdminPathCached: vi.fn() }))
vi.mock('@/modules/shop/lib/access', () => ({ hasShopPermission: vi.fn() }))

import { getSessionFromCookie } from '@/lib/auth/session'
import { getAdminPathCached } from '@/lib/config/site'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { resolveProductAdminEditHref } from '@/modules/shop/lib/admin-edit'

const session = vi.mocked(getSessionFromCookie)
const adminPath = vi.mocked(getAdminPathCached)
const permission = vi.mocked(hasShopPermission)

// Only the identity matters to the code under test; the permission answer is
// mocked separately.
const user = { id: 'u1' } as unknown as Awaited<ReturnType<typeof getSessionFromCookie>>

describe('resolveProductAdminEditHref', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    session.mockResolvedValue(user)
    permission.mockResolvedValue(true)
    adminPath.mockResolvedValue('lemon-a1b2c3')
  })

  it('gives a signed-in editor the product editor URL', async () => {
    await expect(resolveProductAdminEditHref('prod_1')).resolves.toBe('/lemon-a1b2c3/m/shop/products/prod_1')
  })

  it('gives a shopper nothing', async () => {
    session.mockResolvedValue(null)
    await expect(resolveProductAdminEditHref('prod_1')).resolves.toBeNull()
    // Not merely null - the admin path must not even be looked up for someone
    // who will never be shown it.
    expect(adminPath).not.toHaveBeenCalled()
  })

  it('gives staff without product permission nothing', async () => {
    permission.mockResolvedValue(false)
    await expect(resolveProductAdminEditHref('prod_1')).resolves.toBeNull()
    expect(adminPath).not.toHaveBeenCalled()
  })

  it('asks for the write key, not read-only shop access', async () => {
    await resolveProductAdminEditHref('prod_1')
    expect(permission).toHaveBeenCalledWith(user, 'shop.products')
  })

  it('gives nothing when the site has no admin path to link to', async () => {
    adminPath.mockResolvedValue(null)
    await expect(resolveProductAdminEditHref('prod_1')).resolves.toBeNull()
  })
})
