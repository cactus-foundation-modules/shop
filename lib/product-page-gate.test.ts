import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/modules/shop/lib/access', () => ({ canPreviewDraftProducts: vi.fn() }))
vi.mock('@/modules/shop/lib/product-page-resolver', () => ({ resolveAliasedProduct: vi.fn() }))

import { canPreviewDraftProducts } from '@/modules/shop/lib/access'
import { resolveAliasedProduct } from '@/modules/shop/lib/product-page-resolver'
import { getProductStorefrontReachability, resolveProductForProductPage } from '@/modules/shop/lib/product-page-gate'
import type { ShpProduct } from '@/modules/shop/lib/types'

const product = (over: Partial<ShpProduct>): ShpProduct =>
  ({
    id: 'p1',
    name: 'Chair',
    slug: 'chair',
    type: 'PHYSICAL',
    status: 'ACTIVE',
    catalogueHidden: false,
    ...over,
  }) as ShpProduct

beforeEach(() => {
  vi.mocked(canPreviewDraftProducts).mockReset()
  vi.mocked(resolveAliasedProduct).mockReset()
})

describe('getProductStorefrontReachability', () => {
  it('shows active products to everyone', async () => {
    expect(await getProductStorefrontReachability(product({ status: 'ACTIVE' }))).toEqual({
      reachable: true,
      draftPreview: false,
    })
    expect(canPreviewDraftProducts).not.toHaveBeenCalled()
  })

  it('404s draft products for shoppers', async () => {
    vi.mocked(canPreviewDraftProducts).mockResolvedValue(false)
    expect(await getProductStorefrontReachability(product({ status: 'DRAFT' }))).toEqual({ reachable: false })
  })

  it('lets staff preview draft products', async () => {
    vi.mocked(canPreviewDraftProducts).mockResolvedValue(true)
    expect(await getProductStorefrontReachability(product({ status: 'DRAFT' }))).toEqual({
      reachable: true,
      draftPreview: true,
    })
  })

  it('never shows catalogue-hidden rows on their own', async () => {
    expect(await getProductStorefrontReachability(product({ catalogueHidden: true }))).toEqual({ reachable: false })
    expect(canPreviewDraftProducts).not.toHaveBeenCalled()
  })
})

describe('resolveProductForProductPage', () => {
  it('returns a draft directly when staff may preview it', async () => {
    vi.mocked(canPreviewDraftProducts).mockResolvedValue(true)
    const draft = product({ status: 'DRAFT' })
    expect(await resolveProductForProductPage('chair', draft)).toEqual({ product: draft, draftPreview: true })
    expect(resolveAliasedProduct).not.toHaveBeenCalled()
  })

  it('falls through to alias resolution when a draft is not reachable', async () => {
    vi.mocked(canPreviewDraftProducts).mockResolvedValue(false)
    const parent = product({ id: 'p2', slug: 'parent' })
    vi.mocked(resolveAliasedProduct).mockResolvedValue(parent)
    expect(await resolveProductForProductPage('variant', product({ status: 'DRAFT', catalogueHidden: true }))).toEqual({
      product: parent,
      draftPreview: false,
    })
  })
})
