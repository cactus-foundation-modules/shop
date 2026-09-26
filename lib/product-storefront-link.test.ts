import { describe, it, expect, vi, beforeEach } from 'vitest'

// Where the admin order screen sends a line's name. Registry, installed modules,
// slugs and the URL style are mocked at their doors: which providers answer is
// the thing under test.
const registry: Record<string, Record<string, unknown>> = {}
const installed: Array<{ manifest: unknown }> = []
const slugs = new Map<string, string>()
vi.mock('@/lib/modules/extension-points.server', () => ({ moduleServerExtensionPointComponents: registry }))
vi.mock('@/lib/modules/live-status', () => ({ getInstalledManifests: vi.fn(async () => installed) }))
vi.mock('@/modules/shop/lib/db/products', () => ({ getProductSlugsByIds: vi.fn(async () => slugs) }))
vi.mock('@/modules/shop/lib/product-url-server', () => ({ getProductUrlStyle: vi.fn(async () => 'ROOT') }))

import { resolveProductStorefrontHrefs, storefrontHref } from '@/modules/shop/lib/product-storefront-link'

const POINT = 'shop.product-storefront-link'

beforeEach(() => {
  for (const key of Object.keys(registry)) delete registry[key]
  installed.length = 0
  slugs.clear()
  slugs.set('desk', 'desk')
  slugs.set('child', 'desk-160cm-walnut')
})

describe('storefrontHref', () => {
  it('appends the query to the page in the shop URL style', () => {
    expect(storefrontHref({ slug: 'desk', query: 'width=160cm&finish=walnut' }, 'ROOT')).toBe('/desk?width=160cm&finish=walnut')
    expect(storefrontHref({ slug: 'desk', query: null }, 'SHOP')).toBe('/shop/products/desk')
  })
})

describe('resolveProductStorefrontHrefs', () => {
  it("falls back to each product's own slug with no provider installed", async () => {
    const hrefs = await resolveProductStorefrontHrefs(['desk', 'child', 'gone'])
    expect(Object.fromEntries(hrefs)).toEqual({ desk: '/desk', child: '/desk-160cm-walnut' })
  })

  it("takes a provider's parent page and query for the ids it recognises", async () => {
    registry[POINT] = { v: async (ids: string[]) => (ids.includes('child') ? { child: { slug: 'desk', query: '?width=160cm' } } : {}) }
    installed.push({ manifest: { extensionPoints: [{ point: POINT, id: 'v' }] } })
    const hrefs = await resolveProductStorefrontHrefs(['desk', 'child'])
    expect(Object.fromEntries(hrefs)).toEqual({ desk: '/desk', child: '/desk?width=160cm' })
  })

  it('skips a provider that throws or answers nonsense', async () => {
    registry[POINT] = {
      broken: async () => { throw new Error('boom') },
      silly: async () => ({ child: { slug: '', query: 'x=y' }, desk: 'not a link' }),
    }
    installed.push({ manifest: { extensionPoints: [{ point: POINT, id: 'broken' }, { point: POINT, id: 'silly' }] } })
    const hrefs = await resolveProductStorefrontHrefs(['desk', 'child'])
    expect(Object.fromEntries(hrefs)).toEqual({ desk: '/desk', child: '/desk-160cm-walnut' })
  })
})
