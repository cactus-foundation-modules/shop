import { beforeEach, describe, expect, it, vi } from 'vitest'

// The courier's own booking answering a reported delay (070): the claim is the
// gate, the email follows it, and a quiet parcel still has its delay closed.

const claim = vi.hoisted(() => vi.fn())
const shipments = vi.hoisted(() => vi.fn())
const notify = vi.hoisted(() => vi.fn())

vi.mock('@/modules/shop/lib/db/shipments', () => ({
  claimDelayAnsweredByCourier: claim,
  getShipmentsForOrder: shipments,
}))
vi.mock('@/modules/shop/lib/db/orders', () => ({ getOrderById: async () => ({ id: 'ord-1', orderNumber: 'DW1', customerName: 'A' }) }))
vi.mock('@/modules/shop/lib/order-notify', () => ({ notifyOrderCustomer: notify }))
vi.mock('@/modules/shop/lib/delivery-slot-email', () => ({ parcelEmailVars: async () => ({ orderNumber: 'DW1' }) }))
vi.mock('@/lib/config/timezone.server', () => ({ getSiteTimezone: async () => 'Europe/London' }))

const { maybeAnswerDelayFromCourier } = await import('./delivery-delay-email')

const tz = 'Europe/London'
const thursday = { windowFrom: new Date('2026-10-15T09:00:00Z'), windowTo: new Date('2026-10-15T12:00:00Z') }
const missedDay = { windowFrom: new Date('2026-10-09T09:00:00Z'), windowTo: new Date('2026-10-09T12:00:00Z') }
const parcel = {
  id: 's1', orderId: 'ord-1', deliveryDelay: 'today' as const, deliveryDelayedFrom: '2026-10-09',
  deliveredAt: null, quietCustomerEmails: false,
}

beforeEach(() => {
  for (const mock of [claim, shipments, notify]) mock.mockReset()
  claim.mockResolvedValue(true)
  // The row as the claim leaves it: delay closed, the courier's day on it.
  shipments.mockResolvedValue([{
    ...parcel, deliveryDelay: null, deliveryDate: '2026-10-15', deliverySlotStart: null, deliverySlotEnd: null,
    deliveryWindowFrom: thursday.windowFrom, deliveryWindowTo: thursday.windowTo, items: [],
  }])
})

describe('maybeAnswerDelayFromCourier', () => {
  it('sends the new-date email, with the courier\'s window, once the claim is won', async () => {
    expect(await maybeAnswerDelayFromCourier(parcel, thursday, tz)).toBe(true)
    expect(claim).toHaveBeenCalledWith('s1', '2026-10-15')
    expect(notify).toHaveBeenCalledWith('DELIVERY_NEW_DATE', expect.anything(), expect.objectContaining({
      hasNewDayWindow: 'true', deliveryWindow: expect.stringContaining('10'),
    }))
  })

  it('leaves the missed day\'s window, and a parcel with no delay, to the ordinary email', async () => {
    expect(await maybeAnswerDelayFromCourier(parcel, missedDay, tz)).toBe(false)
    expect(await maybeAnswerDelayFromCourier({ ...parcel, deliveryDelay: null }, thursday, tz)).toBe(false)
    expect(claim).not.toHaveBeenCalled()
  })

  it('sends nothing when another reader won the claim', async () => {
    claim.mockResolvedValue(false)
    expect(await maybeAnswerDelayFromCourier(parcel, thursday, tz)).toBe(false)
    expect(notify).not.toHaveBeenCalled()
  })

  it('closes the delay on a quiet parcel without telling anybody', async () => {
    expect(await maybeAnswerDelayFromCourier({ ...parcel, quietCustomerEmails: true }, thursday, tz)).toBe(true)
    expect(claim).toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })
})
