import { beforeEach, describe, expect, it, vi } from 'vitest'

// The courier's own booking answering a reported delay (070): the claim is the
// gate, the email follows it, and a quiet parcel still has its delay closed.

const claim = vi.hoisted(() => vi.fn())
const shipments = vi.hoisted(() => vi.fn())
const notify = vi.hoisted(() => vi.fn())
const stamp = vi.hoisted(() => vi.fn())

vi.mock('@/modules/shop/lib/db/shipments', () => ({
  claimDelayAnsweredByCourier: claim,
  getShipmentsForOrder: shipments,
  setSlotNotification: stamp,
}))
vi.mock('@/modules/shop/lib/db/orders', () => ({ getOrderById: async () => ({ id: 'ord-1', orderNumber: 'DW1', customerName: 'A' }) }))
vi.mock('@/modules/shop/lib/order-notify', () => ({ notifyOrderCustomer: notify }))
vi.mock('@/modules/shop/lib/delivery-slot-email', () => ({ parcelEmailVars: async () => ({ orderNumber: 'DW1' }) }))
vi.mock('@/lib/config/timezone.server', () => ({ getSiteTimezone: async () => 'Europe/London' }))

const { maybeAnswerDelayFromCourier, sendDeliveryDelayEmail } = await import('./delivery-delay-email')

const tz = 'Europe/London'
const thursday = { windowFrom: new Date('2026-10-15T09:00:00Z'), windowTo: new Date('2026-10-15T12:00:00Z') }
const missedDay = { windowFrom: new Date('2026-10-09T09:00:00Z'), windowTo: new Date('2026-10-09T12:00:00Z') }
const parcel = {
  id: 's1', orderId: 'ord-1', deliveryDelay: 'today' as const, deliveryDelayedFrom: '2026-10-09',
  deliveredAt: null, quietCustomerEmails: false,
}

beforeEach(() => {
  for (const mock of [claim, shipments, notify, stamp]) mock.mockReset()
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
    expect(claim).toHaveBeenCalledWith('s1', '2026-10-15', true)
    expect(notify).toHaveBeenCalledWith('DELIVERY_NEW_DATE', expect.anything(), expect.objectContaining({
      hasNewDayWindow: 'true', deliveryWindow: expect.stringContaining('10'),
    }))
  })

  it('leaves the missed day\'s window, and a parcel with no delay, to the ordinary email', async () => {
    expect(await maybeAnswerDelayFromCourier(parcel, missedDay, tz)).toBe(false)
    expect(await maybeAnswerDelayFromCourier({ ...parcel, deliveryDelay: null }, thursday, tz)).toBe(false)
    expect(claim).not.toHaveBeenCalled()
  })

  it('answers with the day alone, and leaves the stamp free, when the courier gives the whole day', async () => {
    const wholeDay = { windowFrom: new Date('2026-10-14T23:00:00Z'), windowTo: new Date('2026-10-15T22:59:59Z') }
    shipments.mockResolvedValue([{
      ...parcel, deliveryDelay: null, deliveryDate: '2026-10-15', deliverySlotStart: null, deliverySlotEnd: null,
      deliveryWindowFrom: wholeDay.windowFrom, deliveryWindowTo: wholeDay.windowTo, items: [],
    }])
    expect(await maybeAnswerDelayFromCourier(parcel, wholeDay, tz)).toBe(true)
    expect(claim).toHaveBeenCalledWith('s1', '2026-10-15', false)
    expect(notify).toHaveBeenCalledWith('DELIVERY_NEW_DATE', expect.anything(), expect.objectContaining({
      hasNewDayOnly: 'true', hasNewDayWindow: 'false', deliveryWindow: '',
    }))
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

describe('one email per piece of news', () => {
  const reported = {
    id: 's1', orderId: 'ord-1', deliveryDelay: null, deliveryDelayedFrom: '2026-10-09', deliveredAt: null,
    quietCustomerEmails: false, slotNotifiedAt: null, deliveryDelayNote: null,
    deliveryDate: '2026-10-12', deliverySlotStart: null, deliverySlotEnd: null, items: [],
  }

  it('a delay email that names the courier\'s window for the new day marks the window told', async () => {
    shipments.mockResolvedValue([{
      ...reported,
      deliveryWindowFrom: new Date('2026-10-12T09:00:00Z'), deliveryWindowTo: new Date('2026-10-12T11:00:00Z'),
    }])
    await sendDeliveryDelayEmail({ orderId: 'ord-1', shipmentId: 's1', kind: 'new-date' })
    expect(stamp).toHaveBeenCalledWith('s1', 'ord-1', true)
    expect(notify).toHaveBeenCalledWith('DELIVERY_DELAYED', expect.anything(), expect.objectContaining({ hasNewDayWindow: 'true' }))
  })

  it('one with the day alone - the DW000219 case, a whole-day reading - leaves the window untold', async () => {
    shipments.mockResolvedValue([{
      ...reported,
      deliveryWindowFrom: new Date('2026-10-11T23:00:00Z'), deliveryWindowTo: new Date('2026-10-12T22:59:59Z'),
    }])
    await sendDeliveryDelayEmail({ orderId: 'ord-1', shipmentId: 's1', kind: 'new-date' })
    expect(stamp).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('DELIVERY_DELAYED', expect.anything(), expect.objectContaining({ hasNewDayOnly: 'true', deliveryWindow: '' }))
  })
})
