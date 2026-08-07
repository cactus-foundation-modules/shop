import { describe, it, expect, vi, beforeEach } from 'vitest'

// The gate that decides who is shown a sold-out product. Mocked at the two
// doors it reads (the shop's config and the staff check) because the branch
// logic IS the thing under test, and every branch of it is a decision about
// what a stranger on the internet gets to see.
//
// Two properties matter enough to be pinned here rather than trusted:
//
//  - a shop on the default reaches for no cookie at all, because the moment it
//    does, every public shop page becomes a per-visitor render;
//  - staff exemption never survives being switched off, in either direction.
vi.mock('@/lib/db/prisma', () => ({ prisma: { module: { findMany: vi.fn(async () => []) } } }))
vi.mock('@/lib/modules/live-status', () => ({ INSTALLED_MODULE_WHERE: {} }))
vi.mock('@/lib/modules/extension-points', () => ({ moduleExtensionPointComponents: {} }))
vi.mock('@/modules/shop/lib/config', () => ({ getShopConfigCached: vi.fn() }))
vi.mock('@/modules/shop/lib/access', () => ({ canSeeHiddenOutOfStock: vi.fn() }))

import { getShopConfigCached } from '@/modules/shop/lib/config'
import { canSeeHiddenOutOfStock } from '@/modules/shop/lib/access'
import { getStockGate, hidesOutOfStockFromShoppers } from '@/modules/shop/lib/stock-visibility'
import type { ShpConfig } from '@/modules/shop/lib/config'

const config = (over: Partial<ShpConfig>) => ({
  outOfStockVisibility: 'SHOW',
  outOfStockHiddenFromStaff: false,
  ...over,
}) as ShpConfig

beforeEach(() => {
  vi.mocked(getShopConfigCached).mockReset()
  vi.mocked(canSeeHiddenOutOfStock).mockReset()
})

describe('getStockGate', () => {
  it('hides nothing and asks nobody who is signed in on the default setting', async () => {
    vi.mocked(getShopConfigCached).mockResolvedValue(config({ outOfStockVisibility: 'SHOW' }))

    expect(await getStockGate()).toEqual({ hideFromLists: false, hideProductPage: false, staffPreview: false })
    // The one that would cost a shop its cacheable public pages.
    expect(canSeeHiddenOutOfStock).not.toHaveBeenCalled()
  })

  it('takes a shopper out of the listings but leaves the page alone', async () => {
    vi.mocked(getShopConfigCached).mockResolvedValue(config({ outOfStockVisibility: 'HIDE_FROM_LISTS' }))
    vi.mocked(canSeeHiddenOutOfStock).mockResolvedValue(false)

    expect(await getStockGate()).toEqual({ hideFromLists: true, hideProductPage: false, staffPreview: false })
  })

  it('takes the page too when the shop hides them everywhere', async () => {
    vi.mocked(getShopConfigCached).mockResolvedValue(config({ outOfStockVisibility: 'HIDE_EVERYWHERE' }))
    vi.mocked(canSeeHiddenOutOfStock).mockResolvedValue(false)

    expect(await getStockGate()).toEqual({ hideFromLists: true, hideProductPage: true, staffPreview: false })
  })

  it('shows staff everything, and says so, while the exemption stands', async () => {
    vi.mocked(getShopConfigCached).mockResolvedValue(config({ outOfStockVisibility: 'HIDE_EVERYWHERE' }))
    vi.mocked(canSeeHiddenOutOfStock).mockResolvedValue(true)

    expect(await getStockGate()).toEqual({ hideFromLists: false, hideProductPage: false, staffPreview: true })
  })

  it('hides from staff too once the owner says so, without checking who they are', async () => {
    vi.mocked(getShopConfigCached).mockResolvedValue(
      config({ outOfStockVisibility: 'HIDE_FROM_LISTS', outOfStockHiddenFromStaff: true }),
    )

    expect(await getStockGate()).toEqual({ hideFromLists: true, hideProductPage: false, staffPreview: false })
    expect(canSeeHiddenOutOfStock).not.toHaveBeenCalled()
  })
})

describe('hidesOutOfStockFromShoppers', () => {
  // What the sitemap asks, which has no viewer and must never take the staff
  // exemption: a hidden product's URL handed to a search engine is the setting
  // undone.
  it('is false only on the default', () => {
    expect(hidesOutOfStockFromShoppers(config({ outOfStockVisibility: 'SHOW' }))).toBe(false)
    expect(hidesOutOfStockFromShoppers(config({ outOfStockVisibility: 'HIDE_FROM_LISTS' }))).toBe(true)
    expect(hidesOutOfStockFromShoppers(config({ outOfStockVisibility: 'HIDE_EVERYWHERE' }))).toBe(true)
  })
})
