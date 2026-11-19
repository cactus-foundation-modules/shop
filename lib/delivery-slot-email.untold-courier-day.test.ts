import { beforeEach, describe, expect, it, vi } from 'vitest'

// The courier's whole-day booking, shown in the edit form and saved back
// untouched with the box ticked. Order DW000284, 19 November 2026: Fieldly
// booked the 26th, staff saved with the box ticked, and nothing went.

const claim = vi.hoisted(() => vi.fn())
const notify = vi.hoisted(() => vi.fn())

vi.mock('@/modules/shop/lib/db/shipments', () => ({
  claimCourierDay: claim,
  getShipmentsForOrder: vi.fn(async () => [{ id: 's1', orderId: 'ord-1', deliveryDate: '2099-11-26', quietCustomerEmails: false, items: [] }]),
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
const parcel = {
  id: 's1', orderId: 'ord-1', quietCustomerEmails: false, deliveredAt: null,
  deliveryDate: null, deliverySlotStart: null, deliverySlotEnd: null,
  deliveryWindowFrom: new Date('2099-11-26T00:00:00Z'),
  deliveryWindowTo: new Date('2099-11-26T23:59:00Z'),
  slotNotifiedAt: null,
}

beforeEach(() => {
  claim.mockReset()
  notify.mockReset()
  claim.mockResolvedValue({ dayChanged: true, windowTold: false })
})

describe('maybeSendUntoldCourierDay', () => {
  it('claims and tells the courier day when the box is ticked', async () => {
    expect(await email.maybeSendUntoldCourierDay(parcel, true, 'fieldly', TZ)).toBe(true)
    expect(claim).toHaveBeenCalledWith('s1', '2099-11-26')
    expect(notify).toHaveBeenCalledWith('DELIVERY_DAY_BOOKED', expect.anything(), expect.anything(), { shipmentId: 's1' })
  })

  it('does nothing with the box unticked', async () => {
    expect(await email.maybeSendUntoldCourierDay(parcel, false, 'fieldly', TZ)).toBe(false)
    expect(claim).not.toHaveBeenCalled()
  })

  it('never takes a Palletways deadline as a booked day', async () => {
    expect(await email.maybeSendUntoldCourierDay(parcel, true, 'palletways', TZ)).toBe(false)
    expect(claim).not.toHaveBeenCalled()
  })

  it('leaves a day staff typed to the typed-day email', async () => {
    expect(await email.maybeSendUntoldCourierDay({ ...parcel, deliveryDate: '2099-11-26' }, true, 'fieldly', TZ)).toBe(false)
    expect(claim).not.toHaveBeenCalled()
  })

  it('stays quiet once a window has been told', async () => {
    expect(await email.maybeSendUntoldCourierDay({ ...parcel, slotNotifiedAt: new Date() }, true, 'fieldly', TZ)).toBe(false)
    expect(claim).not.toHaveBeenCalled()
  })

  it('stays quiet for a real window (the window email handles it)', async () => {
    const windowed = { ...parcel, deliveryWindowFrom: new Date('2099-11-26T10:00:00Z'), deliveryWindowTo: new Date('2099-11-26T13:00:00Z') }
    expect(await email.maybeSendUntoldCourierDay(windowed, true, 'fieldly', TZ)).toBe(false)
    expect(claim).not.toHaveBeenCalled()
  })

  it('sends nothing when the day was already claimed', async () => {
    claim.mockResolvedValue(null)
    expect(await email.maybeSendUntoldCourierDay(parcel, true, 'fieldly', TZ)).toBe(false)
    expect(notify).not.toHaveBeenCalled()
  })
})
