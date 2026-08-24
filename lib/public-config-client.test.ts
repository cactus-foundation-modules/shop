import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchShopPublicConfig, invalidateShopPublicConfig } from '@/modules/shop/lib/public-config-client'

// The point of this module is that a checkout page asks the server once instead
// of eight times, so that is what these check: the coalescing, and the one case
// where holding an answer would be wrong.

const ok = (body: unknown) => ({ ok: true, json: async () => body })
const failed = { ok: false, json: async () => null }

describe('fetchShopPublicConfig', () => {
  beforeEach(() => { invalidateShopPublicConfig() })
  afterEach(() => {
    vi.unstubAllGlobals()
    invalidateShopPublicConfig()
  })

  it('asks the server once however many callers ask at the same moment', async () => {
    const server = vi.fn(async () => ok({ currencySymbol: '£' }))
    vi.stubGlobal('fetch', server)

    // Eight is not an arbitrary number: it is what a checkout page mounts.
    const answers = await Promise.all(Array.from({ length: 8 }, () => fetchShopPublicConfig()))

    expect(server).toHaveBeenCalledTimes(1)
    expect(answers).toHaveLength(8)
    for (const answer of answers) expect(answer?.currencySymbol).toBe('£')
  })

  it('hands the held answer to a caller arriving after it has landed', async () => {
    const server = vi.fn(async () => ok({ currencySymbol: '€' }))
    vi.stubGlobal('fetch', server)

    const first = await fetchShopPublicConfig()
    const second = await fetchShopPublicConfig()

    expect(server).toHaveBeenCalledTimes(1)
    expect(first?.currencySymbol).toBe('€')
    expect(second?.currencySymbol).toBe('€')
  })

  it('does not hold a failure - the next caller gets a fresh attempt', async () => {
    const server = vi.fn()
      .mockResolvedValueOnce(failed)
      .mockResolvedValue(ok({ currencySymbol: '$' }))
    vi.stubGlobal('fetch', server)

    expect(await fetchShopPublicConfig()).toBeNull()
    expect(await fetchShopPublicConfig()).toEqual({ currencySymbol: '$' })
    expect(server).toHaveBeenCalledTimes(2)
  })

  it('answers null rather than throwing when the request itself blows up', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(fetchShopPublicConfig()).resolves.toBeNull()
  })

  it('goes back to the server once the held answer is dropped', async () => {
    const server = vi.fn(async () => ok({ currencySymbol: '£' }))
    vi.stubGlobal('fetch', server)

    await fetchShopPublicConfig()
    invalidateShopPublicConfig()
    await fetchShopPublicConfig()

    expect(server).toHaveBeenCalledTimes(2)
  })
})
