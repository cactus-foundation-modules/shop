import { beforeEach, describe, expect, it, vi } from 'vitest'

// The courier moving a day it had booked, and we had told, to another day.
// Order DW000263, 19 November 2026: told Monday 23rd, then Tuesday 24th, in
// two identical "booked in for" emails four hours apart.

const claim = vi.hoisted(() => vi.fn())
const notify = vi.hoisted(() => vi.fn())

vi.mock('@/modules/shop/lib/db/shipments', () => ({
  claimCourierDay: claim,
  getShipmentsForOrder: vi.fn(async () => [{ id: 's1', orderId: 'ord-1', deliveryDate: '2099-11-24', quietCustomerEmails: false, carrier: 'Route1 Group', items: [] }]),
  claimMovedWindowNotification: vi.fn(),
  claimSlotNotification: vi.fn(),
  getOrderDispatchSummary: vi.fn(async () => ({ lines: [] })),
  recordToldWindow: vi.fn(),
}))
vi.mock('@/modules/shop/lib/db/orders', () => ({ getOrderById: vi.fn(async () => ({ id: 'ord-1', orderNumber: 'DW1' })) }))
vi.mock('@/modules/shop/lib/order-notify', () => ({ notifyOrderCustomer: notify }))
vi.mock('@/modules/shop/lib/config', () => ({ getShopConfigCached: vi.fn(async () => ({})) }))
vi.mock('@/modules/shop/lib/order-item-email-media', () => ({ orderItemEmailMedia: vi.fn(async () => ({})) }))
vi.mock('@/modules/shop/lib/order-items-email', () => ({ renderOrderItemsTable: vi.fn(() => '') }))
vi.mock('@/modules/shop/lib/courier-faqs', () => ({ courierFaqUrl: vi.fn(() => ''), faqsForShipment: vi.fn(() => []) }))
vi.mock('@/modules/shop/lib/order-tracking', () => ({ orderTrackingUrl: vi.fn(() => '') }))

const email = await import('./delivery-slot-email')

const TZ = 'Europe/London'
const parcel = { id: 's1', orderId: 'ord-1', quietCustomerEmails: false, deliveredAt: null }

beforeEach(() => {
  claim.mockReset()
  notify.mockReset()
})

describe('maybeSendCourierDayEmail when the courier moves a told day', () => {
  it('sends the day-changed email naming both days', async () => {
    claim.mockResolvedValue({ dayChanged: true, windowTold: false, previousDay: '2099-11-23' })
    expect(await email.maybeSendCourierDayEmail(parcel, '2099-11-24', TZ)).toBe(true)
    expect(notify).toHaveBeenCalledTimes(1)
    const [trigger, , vars, meta] = notify.mock.calls[0] ?? []
    expect(trigger).toBe('DELIVERY_DAY_CHANGED')
    expect(vars).toMatchObject({ previousDeliveryDay: expect.stringContaining('23'), deliveryDay: expect.stringContaining('24'), carrier: 'Route1 Group' })
    expect(meta).toEqual({ shipmentId: 's1' })
  })

  it('sends the plain booked email for a first day', async () => {
    claim.mockResolvedValue({ dayChanged: true, windowTold: false, previousDay: null })
    expect(await email.maybeSendCourierDayEmail(parcel, '2099-11-24', TZ)).toBe(true)
    expect(notify).toHaveBeenCalledWith('DELIVERY_DAY_BOOKED', expect.anything(), expect.not.objectContaining({ previousDeliveryDay: expect.anything() }), { shipmentId: 's1' })
  })

  it('treats a move away from a day already gone as a plain booking', async () => {
    claim.mockResolvedValue({ dayChanged: true, windowTold: false, previousDay: '2000-01-03' })
    expect(await email.maybeSendCourierDayEmail(parcel, '2099-11-24', TZ)).toBe(true)
    expect(notify).toHaveBeenCalledWith('DELIVERY_DAY_BOOKED', expect.anything(), expect.anything(), { shipmentId: 's1' })
  })

  // The claim lifts the stamp of a window told for the day being left
  // (claimCourierDay), so a stamp that survives it was for the new day.
  it('stays quiet when a window for the new day was already told', async () => {
    claim.mockResolvedValue({ dayChanged: true, windowTold: true, previousDay: '2099-11-23' })
    expect(await email.maybeSendCourierDayEmail(parcel, '2099-11-24', TZ)).toBe(false)
    expect(notify).not.toHaveBeenCalled()
  })
})
