import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/config/timezone.server', () => ({}))
vi.mock('@/modules/shop/lib/config', () => ({}))
vi.mock('@/modules/shop/lib/db/orders', () => ({}))
vi.mock('@/modules/shop/lib/db/shipments', () => ({}))
vi.mock('@/modules/shop/lib/dispatch-follow-up', () => ({}))

const { pickParcel } = await import('./ait-window-inbound')

const read = { date: '2026-10-14', slotStart: '08:06', slotEnd: '10:06', address: 'London , EC3V 1LP' }

function parcel(id: string, extra: Record<string, unknown> = {}) {
  return {
    orderNumber: `DW${id}`,
    parcel: {
      id, orderId: `ord-${id}`, deliveryDate: null, deliverySlotStart: null, deliverySlotEnd: null,
      deliveryWindowFrom: null, deliveryWindowTo: null, ...extra,
    } as never,
  }
}

describe('pickParcel', () => {
  it('takes the one parcel to that postcode booked for the day by the courier', () => {
    const one = parcel('1', {
      deliveryWindowFrom: new Date('2026-10-14T06:48:00Z'), deliveryWindowTo: new Date('2026-10-14T08:48:00Z'),
    })
    expect(pickParcel(read, [one], 'Europe/London')).toEqual({ found: one })
  })

  it('takes one booked for the day by hand', () => {
    const one = parcel('1', { deliveryDate: '2026-10-14' })
    expect(pickParcel(read, [one, parcel('2', { deliveryDate: '2026-10-20' })], 'Europe/London')).toEqual({ found: one })
  })

  it('puts it on nothing when no parcel is booked for that day', () => {
    const result = pickParcel(read, [parcel('1', { deliveryDate: '2026-10-20' })], 'Europe/London')
    expect(result).toHaveProperty('reason')
  })

  it('lets the courier\'s own times decide between two on the day, and refuses when they cannot', () => {
    const a = parcel('1', {
      deliveryDate: '2026-10-14',
      deliveryWindowFrom: new Date('2026-10-14T07:06:00Z'), deliveryWindowTo: new Date('2026-10-14T09:06:00Z'),
    })
    const b = parcel('2', { deliveryDate: '2026-10-14' })
    expect(pickParcel(read, [a, b], 'Europe/London')).toEqual({ found: a })
    expect(pickParcel(read, [b, parcel('3', { deliveryDate: '2026-10-14' })], 'Europe/London')).toHaveProperty('reason')
  })

  it('says nothing with no parcel to the postcode', () => {
    expect(pickParcel(read, [], 'Europe/London')).toBeNull()
  })
})
