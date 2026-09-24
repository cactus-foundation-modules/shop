import { describe, it, expect, vi, beforeEach } from 'vitest'

// `notifyProductsSaved` - the batch form of the `shop.product-saved`
// announcement, used by the paths that move several products at once (an order
// taking units off the shelf, a refund putting them back, a bulk status
// change).
//
// Two things are worth holding still. The installed-module list is read ONCE
// however many products moved - an order of six lines reading six manifests to
// answer the same question is the fan-out this helper exists to avoid. And a
// listener that throws is logged and the rest still run, because a companion
// module having a bad day must never fail a payment webhook.

const registry = vi.hoisted(() => ({ map: {} as Record<string, Record<string, unknown>> }))
const manifests = vi.hoisted(() => vi.fn())

vi.mock('@/lib/modules/extension-points.public', () => ({
  get modulePublicExtensionPointComponents() {
    return registry.map
  },
}))
vi.mock('@/lib/modules/live-status', () => ({ getInstalledManifests: manifests }))

const { notifyProductsSaved } = await import('@/modules/shop/lib/product-saved')

const POINT = 'shop.product-saved'

beforeEach(() => {
  registry.map = {}
  manifests.mockReset()
  manifests.mockResolvedValue([])
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

/** One installed module contributing one hook under `id`. */
function install(id: string, hook: (productId: string, changed: readonly string[]) => Promise<void> | void) {
  registry.map = { ...registry.map, [POINT]: { ...(registry.map[POINT] ?? {}), [id]: hook } }
  manifests.mockResolvedValue(
    Object.keys(registry.map[POINT] ?? {}).map((each) => ({ manifest: { extensionPoints: [{ point: POINT, id: each }] } })),
  )
}

describe('notifyProductsSaved', () => {
  it('tells the listener about every product once, and reads the module list once', async () => {
    const seen: Array<[string, readonly string[]]> = []
    install('listener', (productId, changed) => { seen.push([productId, changed]) })

    await notifyProductsSaved(['p1', 'p2', 'p3'], ['stockCount'])

    expect(seen).toEqual([['p1', ['stockCount']], ['p2', ['stockCount']], ['p3', ['stockCount']]])
    expect(manifests).toHaveBeenCalledTimes(1)
  })

  it('announces a repeated product id only once', async () => {
    const seen: string[] = []
    install('listener', (productId) => { seen.push(productId) })

    await notifyProductsSaved(['p1', 'p1', 'p2'], ['status'])

    expect(seen).toEqual(['p1', 'p2'])
  })

  it('does nothing at all with no products, no fields, or no listeners', async () => {
    install('listener', () => { throw new Error('should not be called') })

    await expect(notifyProductsSaved([], ['stockCount'])).resolves.toBeUndefined()
    await expect(notifyProductsSaved(['p1'], [])).resolves.toBeUndefined()

    registry.map = {}
    manifests.mockResolvedValue([])
    await expect(notifyProductsSaved(['p1'], ['stockCount'])).resolves.toBeUndefined()
  })

  it('carries on past a listener that throws', async () => {
    const seen: string[] = []
    install('angry', () => { throw new Error('no') })
    install('calm', (productId) => { seen.push(productId) })

    await expect(notifyProductsSaved(['p1', 'p2'], ['price'])).resolves.toBeUndefined()

    expect(seen).toEqual(['p1', 'p2'])
  })

  it('never rejects when the module list itself cannot be read', async () => {
    manifests.mockRejectedValue(new Error('database is having a moment'))
    registry.map = { [POINT]: { listener: () => {} } }

    await expect(notifyProductsSaved(['p1'], ['price'])).resolves.toBeUndefined()
  })
})
