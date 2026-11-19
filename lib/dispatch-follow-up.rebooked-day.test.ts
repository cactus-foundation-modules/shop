import { beforeEach, describe, expect, it, vi } from 'vitest'

// A day moved by hand after the window was told. Order DW000285, 19 November
// 2026: told Friday by 17:00, rebooked for the following Thursday with no
// times, and neither the form nor the server would email the customer.

const sendDay = vi.hoisted(() => vi.fn())

vi.mock('@/modules/shop/lib/db/shipments', () => ({}))
vi.mock('@/modules/shop/lib/order-status', () => ({}))
vi.mock('@/modules/shop/lib/tracking-added-email', () => ({}))
vi.mock('@/modules/shop/lib/delivery-slot-email', () => ({ sendDeliveryDayEmail: sendDay }))
vi.mock('@/modules/shop/lib/delivery-delay-email', () => ({}))
vi.mock('@/lib/config/timezone.server', () => ({ getSiteTimezone: vi.fn(async () => 'Europe/London') }))
vi.mock('@/modules/shop/lib/config', () => ({ getShopConfigCached: vi.fn(async () => ({})) }))

const { maybeSendDayEmail } = await import('./dispatch-follow-up')

const told = {
  id: 's1', orderId: 'ord-1', items: [], quietCustomerEmails: false,
  deliveryDate: '2026-11-20', deliverySlotStart: null, deliverySlotEnd: null,
  slotNotifiedAt: new Date('2026-11-18T21:00:06Z'),
  slotNotifiedWindow: '2026-11-20 00:00-17:00',
} as never as Parameters<typeof maybeSendDayEmail>[1]

beforeEach(() => {
  sendDay.mockReset()
})

describe('maybeSendDayEmail after the window was told', () => {
  it('sends the new day when staff rebook it', async () => {
    const after = { ...told, deliveryDate: '2026-11-26' }
    expect(await maybeSendDayEmail('ord-1', told, after, true, { rebooking: true })).toBe(true)
    expect(sendDay).toHaveBeenCalledOnce()
  })

  it('stays quiet when the box is unticked', async () => {
    const after = { ...told, deliveryDate: '2026-11-26' }
    expect(await maybeSendDayEmail('ord-1', told, after, false, { rebooking: true })).toBe(false)
    expect(sendDay).not.toHaveBeenCalled()
  })

  it('stays quiet when the day goes back to the one told', async () => {
    const moved = { ...told, deliveryDate: '2026-11-26' }
    expect(await maybeSendDayEmail('ord-1', moved, told, true, { rebooking: true })).toBe(false)
    expect(sendDay).not.toHaveBeenCalled()
  })

  it('leaves an automatic day change to the moved-window email', async () => {
    const after = { ...told, deliveryDate: '2026-11-26' }
    expect(await maybeSendDayEmail('ord-1', told, after, true)).toBe(false)
    expect(sendDay).not.toHaveBeenCalled()
  })

  it('sends the day on a parcel told before the window was recorded', async () => {
    const old = { ...told, slotNotifiedWindow: null }
    const after = { ...old, deliveryDate: '2026-11-26' }
    expect(await maybeSendDayEmail('ord-1', old, after, true, { rebooking: true })).toBe(true)
  })
})
