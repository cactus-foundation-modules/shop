import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ShpProduct } from '@/modules/shop/lib/types'

// Three product-page seams that ask other modules for an answer, and what each
// does when one of those modules misbehaves. A product page is the last place a
// broken companion module should be able to take down, so a throwing provider
// is skipped rather than allowed to 500 the page, and the order providers are
// asked in is the installed modules' order rather than whatever the generated
// map happened to list first.

const registry = vi.hoisted(() => ({ map: {} as Record<string, Record<string, unknown>> }))
const manifests = vi.hoisted(() => vi.fn())

vi.mock('@/lib/modules/extension-points.public', () => ({
  get modulePublicExtensionPointComponents() {
    return registry.map
  },
}))
vi.mock('@/lib/modules/live-status', () => ({ getInstalledManifests: manifests }))

const { resolveAliasedProduct } = await import('@/modules/shop/lib/product-page-resolver')
const { resolveProductCanonicalQuery } = await import('@/modules/shop/lib/product-canonical')
const { resolveProductRating } = await import('@/modules/shop/lib/detail-rating')

const product = (over: Partial<ShpProduct> = {}): ShpProduct => ({ id: 'p1', slug: 'chair', ...over }) as ShpProduct

// Installed modules, in order, each declaring one entry against `point`.
function installed(point: string, ids: string[]) {
  manifests.mockResolvedValue(ids.map((id) => ({ manifest: { extensionPoints: [{ point, id }] } })))
}

beforeEach(() => {
  registry.map = {}
  manifests.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('resolveAliasedProduct', () => {
  it('takes a throwing resolver as declining and asks the next one', async () => {
    const parent = product({ id: 'p2', slug: 'parent' })
    registry.map = {
      'shop.product-page-resolver': {
        broken: { resolve: () => { throw new Error('boom') } },
        good: { resolve: () => parent },
      },
    }
    installed('shop.product-page-resolver', ['broken', 'good'])
    expect(await resolveAliasedProduct('variant', null)).toBe(parent)
  })

  it('404s rather than 500s when the only resolver throws', async () => {
    registry.map = { 'shop.product-page-resolver': { broken: { resolve: async () => { throw new Error('boom') } } } }
    installed('shop.product-page-resolver', ['broken'])
    expect(await resolveAliasedProduct('variant', null)).toBeNull()
  })
})

describe('resolveProductCanonicalQuery', () => {
  it('falls back to the bare product URL when the provider throws', async () => {
    registry.map = { 'shop.product-canonical-query': { broken: { resolve: () => { throw new Error('boom') } } } }
    installed('shop.product-canonical-query', ['broken'])
    expect(await resolveProductCanonicalQuery(product())).toBeNull()
  })

  it('still takes the next provider after one that throws', async () => {
    registry.map = {
      'shop.product-canonical-query': {
        broken: { resolve: async () => { throw new Error('boom') } },
        good: { resolve: () => 'colour=teal' },
      },
    }
    installed('shop.product-canonical-query', ['broken', 'good'])
    expect(await resolveProductCanonicalQuery(product())).toBe('colour=teal')
  })
})

describe('resolveProductRating', () => {
  const rating = (average: number, count: number) => async (ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, { average, count }]))

  it('asks providers in installed-modules order, not the generated map order', async () => {
    registry.map = { 'shop.product-rating-summary': { second: rating(3, 2), first: rating(4.5, 10) } }
    installed('shop.product-rating-summary', ['first', 'second'])
    expect(await resolveProductRating('p1')).toEqual({ value: '4.5', count: 10, best: 5 })
  })

  it('ignores a provider whose module is not installed', async () => {
    registry.map = { 'shop.product-rating-summary': { gone: rating(5, 3) } }
    installed('shop.product-rating-summary', [])
    expect(await resolveProductRating('p1')).toBeNull()
  })

  it('moves past a provider that throws or has no rating to the first usable one', async () => {
    registry.map = {
      'shop.product-rating-summary': {
        broken: async () => { throw new Error('boom') },
        empty: rating(4, 0),
        good: rating(4.2, 7),
      },
    }
    installed('shop.product-rating-summary', ['broken', 'empty', 'good'])
    expect(await resolveProductRating('p1')).toEqual({ value: '4.2', count: 7, best: 5 })
  })
})
