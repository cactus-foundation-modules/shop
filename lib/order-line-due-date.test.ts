import { describe, it, expect, vi, beforeEach } from 'vitest'

// The orders list's "Delivery due" day. Two halves: nextDueDate, which picks the
// day from what the order holds, and resolveOrderLineDueDates, which asks the
// installed providers for their promises. The registry and the installed-module
// list are mocked at their doors, since which modules answer is the thing under
// test there.
const registry: Record<string, Record<string, unknown>> = {}
const installed: Array<{ manifest: unknown }> = []
vi.mock('@/lib/modules/extension-points.server', () => ({ moduleServerExtensionPointComponents: registry }))
vi.mock('@/lib/modules/live-status', () => ({ getInstalledManifests: vi.fn(async () => installed) }))

import { nextDueDate, resolveOrderLineDueDates, type DueParcel } from '@/modules/shop/lib/order-line-due-date'

const due = (entries: Record<string, string>) => new Map(Object.entries(entries))
const parcel = (over: Partial<DueParcel>): DueParcel => ({ deliveryDate: null, delivered: false, itemIds: [], ...over })

describe('nextDueDate', () => {
  it('names the soonest promise among lines still to go out', () => {
    const lines = [{ itemId: 'a', outstanding: 1 }, { itemId: 'b', outstanding: 2 }]
    expect(nextDueDate(lines, [], due({ a: '2026-09-30', b: '2026-09-23' }))).toBe('2026-09-23')
  })

  it('ignores the promise on a line that has all gone out', () => {
    const lines = [{ itemId: 'a', outstanding: 0 }, { itemId: 'b', outstanding: 1 }]
    expect(nextDueDate(lines, [], due({ a: '2026-09-23', b: '2026-09-30' }))).toBe('2026-09-30')
  })

  it("takes the courier's booked day for a parcel on its way over the promise", () => {
    const lines = [{ itemId: 'a', outstanding: 0 }]
    const parcels = [parcel({ deliveryDate: '2026-09-25', itemIds: ['a'] })]
    expect(nextDueDate(lines, parcels, due({ a: '2026-09-23' }))).toBe('2026-09-25')
  })

  it('falls back to the promise for a parcel with no day booked yet', () => {
    const lines = [{ itemId: 'a', outstanding: 0 }]
    const parcels = [parcel({ itemIds: ['a'] })]
    expect(nextDueDate(lines, parcels, due({ a: '2026-09-23' }))).toBe('2026-09-23')
  })

  it('skips a delivered parcel and names the next one', () => {
    const lines = [{ itemId: 'a', outstanding: 0 }, { itemId: 'b', outstanding: 0 }]
    const parcels = [
      parcel({ deliveryDate: '2026-09-17', delivered: true, itemIds: ['a'] }),
      parcel({ deliveryDate: '2026-09-24', itemIds: ['b'] }),
    ]
    expect(nextDueDate(lines, parcels, due({}))).toBe('2026-09-24')
  })

  it('has nothing to say when everything has arrived', () => {
    const lines = [{ itemId: 'a', outstanding: 0 }]
    const parcels = [parcel({ deliveryDate: '2026-09-17', delivered: true, itemIds: ['a'] })]
    expect(nextDueDate(lines, parcels, due({ a: '2026-09-15' }))).toBeNull()
  })

  it('has nothing to say when nothing still to come was promised a day', () => {
    expect(nextDueDate([{ itemId: 'a', outstanding: 1 }], [], due({}))).toBeNull()
  })
})

describe('resolveOrderLineDueDates', () => {
  const line = (itemId: string) => ({ itemId, orderId: 'o1', lineMeta: null, paid: true })

  beforeEach(() => {
    for (const key of Object.keys(registry)) delete registry[key]
    installed.length = 0
  })

  it('asks nobody, and answers nothing, on a shop with no provider', async () => {
    expect((await resolveOrderLineDueDates([line('a')])).size).toBe(0)
  })

  it('keeps the sooner day where two providers answer one line, and drops a day that is not one', async () => {
    registry['shop.order-line-due-date'] = {
      first: () => ({ a: '2026-09-30', b: 'next Tuesday' }),
      second: async () => ({ a: '2026-09-23' }),
    }
    installed.push({ manifest: { extensionPoints: [
      { point: 'shop.order-line-due-date', id: 'first' },
      { point: 'shop.order-line-due-date', id: 'second' },
    ] } })
    const out = await resolveOrderLineDueDates([line('a'), line('b')])
    expect(out.get('a')).toBe('2026-09-23')
    expect(out.has('b')).toBe(false)
  })

  it('only asks a provider whose module is installed', async () => {
    registry['shop.order-line-due-date'] = { absent: () => ({ a: '2026-09-23' }) }
    expect((await resolveOrderLineDueDates([line('a')])).size).toBe(0)
  })

  it('shrugs off a provider that throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    registry['shop.order-line-due-date'] = {
      broken: () => { throw new Error('nope') },
      fine: () => ({ a: '2026-09-23' }),
    }
    installed.push({ manifest: { extensionPoints: [
      { point: 'shop.order-line-due-date', id: 'broken' },
      { point: 'shop.order-line-due-date', id: 'fine' },
    ] } })
    expect((await resolveOrderLineDueDates([line('a')])).get('a')).toBe('2026-09-23')
    error.mockRestore()
  })
})
