import { describe, it, expect, vi, beforeEach } from 'vitest'

const providers: Array<(lines: unknown[]) => unknown> = []
vi.mock('@/modules/shop/lib/line-meta', () => ({ gatherCartExtensionPoint: async () => providers }))

import { applyCartRequirements } from '@/modules/shop/lib/cart-requirements'
import type { ResolvedCartLine } from '@/modules/shop/lib/checkout'

const line = (id: string, over: Partial<ResolvedCartLine> = {}) =>
  ({ product: { id }, quantity: 1, available: true, ...over }) as unknown as ResolvedCartLine

describe('applyCartRequirements', () => {
  beforeEach(() => { providers.length = 0 })

  it('leaves the basket alone when no module contributes', async () => {
    const lines = [line('a')]
    expect(await applyCartRequirements(lines)).toBe(lines)
  })

  it('marks a flagged line unavailable with its reason and link, and touches no other', async () => {
    providers.push(() => [{ productId: 'a', reason: 'Needs a desk.', link: { href: '/desk', label: 'Choose one' } }])
    const out = await applyCartRequirements([line('a'), line('b')])
    expect(out[0]).toMatchObject({ available: false, availabilityReason: 'Needs a desk.', availabilityLink: { href: '/desk', label: 'Choose one' } })
    expect(out[1]!.available).toBe(true)
  })

  it('keeps the reason a line already had', async () => {
    providers.push(() => [{ productId: 'a', reason: 'Needs a desk.' }])
    const out = await applyCartRequirements([line('a', { available: false, availabilityReason: 'Out of stock' })])
    expect(out[0]!.availabilityReason).toBe('Out of stock')
  })

  it('skips a provider that throws', async () => {
    providers.push(() => { throw new Error('boom') })
    const out = await applyCartRequirements([line('a')])
    expect(out[0]!.available).toBe(true)
  })
})
