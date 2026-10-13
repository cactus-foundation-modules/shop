import { beforeEach, describe, expect, it, vi } from 'vitest'

// The window email goes once per parcel - except when the window the customer
// was told has moved. Order DW000219: the courier's own tracking told the
// customer Monday 08:15 to 10:15, and the owner typing the rebooked window in
// by hand was told the customer would not hear about it.

const claimSlot = vi.hoisted(() => vi.fn())
const setSlot = vi.hoisted(() => vi.fn())
const sendSlot = vi.hoisted(() => vi.fn())

vi.mock('@/modules/shop/lib/db/shipments', () => ({
  claimSlotNotification: claimSlot,
  setSlotNotification: setSlot,
}))
vi.mock('@/modules/shop/lib/order-status', () => ({}))
vi.mock('@/modules/shop/lib/tracking-added-email', () => ({}))
vi.mock('@/modules/shop/lib/delivery-slot-email', () => ({ sendDeliverySlotEmail: sendSlot }))
vi.mock('@/modules/shop/lib/delivery-delay-email', () => ({}))
vi.mock('@/lib/config/timezone.server', () => ({ getSiteTimezone: vi.fn(async () => 'Europe/London') }))

const { maybeSendSlotEmail } = await import('./dispatch-follow-up')

// Told on Friday: the courier's window, nothing typed by hand.
const told = {
  id: 's1', orderId: 'ord-1', items: [], quietCustomerEmails: false,
  deliveryDate: '2026-10-12', deliverySlotStart: null, deliverySlotEnd: null,
  deliveryWindowFrom: new Date('2026-10-12T07:15:00Z'), deliveryWindowTo: new Date('2026-10-12T09:15:00Z'),
  slotNotifiedAt: new Date('2026-10-09T18:43:40Z'),
  deliveryDelay: null, deliveryDelayedFrom: '2026-10-09',
} as never as Parameters<typeof maybeSendSlotEmail>[1]

beforeEach(() => {
  for (const mock of [claimSlot, setSlot, sendSlot]) mock.mockReset()
  claimSlot.mockResolvedValue(true)
})

describe('maybeSendSlotEmail on a parcel whose window was already told', () => {
  it('sends the new window when the owner types a different one', async () => {
    const after = { ...told, deliverySlotStart: '13:00', deliverySlotEnd: '15:00' }
    expect(await maybeSendSlotEmail('ord-1', after, true, told)).toBe(true)
    expect(setSlot).toHaveBeenCalledWith('s1', 'ord-1', true)
    expect(sendSlot).toHaveBeenCalledOnce()
  })

  it('stays quiet when the typed window is the one already told', async () => {
    const after = { ...told, deliverySlotStart: '08:15', deliverySlotEnd: '10:15' }
    expect(await maybeSendSlotEmail('ord-1', after, true, told)).toBe(false)
    expect(sendSlot).not.toHaveBeenCalled()
  })

  it('stays quiet on a save that leaves the window alone', async () => {
    const typed = { ...told, deliverySlotStart: '13:00', deliverySlotEnd: '15:00' }
    expect(await maybeSendSlotEmail('ord-1', typed, true, typed)).toBe(false)
    expect(sendSlot).not.toHaveBeenCalled()
  })

  it('stays quiet when the owner unticks the email', async () => {
    const after = { ...told, deliverySlotStart: '13:00', deliverySlotEnd: '15:00' }
    expect(await maybeSendSlotEmail('ord-1', after, false, told)).toBe(false)
    expect(setSlot).not.toHaveBeenCalled()
  })

  it('judges against the window the email carried, not the parcel a moment ago', async () => {
    // The courier moved its window to the afternoon after the email went; the
    // owner types that afternoon window in. The parcel before the save already
    // reads 13:00-15:00, but the customer was told 08:15-10:15.
    const moved = { ...told, slotNotifiedWindow: '2026-10-12 08:15-10:15',
      deliveryWindowFrom: new Date('2026-10-12T12:00:00Z'), deliveryWindowTo: new Date('2026-10-12T14:00:00Z') }
    const after = { ...moved, deliverySlotStart: '13:00', deliverySlotEnd: '15:00' }
    expect(await maybeSendSlotEmail('ord-1', after, true, moved)).toBe(true)
    expect(sendSlot).toHaveBeenCalledOnce()
  })

  it('stays quiet when the saved window is the one the email carried', async () => {
    const after = { ...told, slotNotifiedWindow: '2026-10-12 13:00-15:00', deliverySlotStart: '13:00', deliverySlotEnd: '15:00' }
    expect(await maybeSendSlotEmail('ord-1', after, true, told)).toBe(false)
  })

  it('sends a courier window that moved after the email, with nothing typed', async () => {
    // Told 07:48-09:48 off the courier's feed; the feed then moved to
    // 07:06-09:06. The owner saves with the time boxes left empty.
    const moved = { ...told, deliveryDate: '2026-10-14', slotNotifiedWindow: '2026-10-14 07:48-09:48',
      deliveryWindowFrom: new Date('2026-10-14T06:06:00Z'), deliveryWindowTo: new Date('2026-10-14T08:06:00Z') }
    expect(await maybeSendSlotEmail('ord-1', moved, true, moved)).toBe(true)
    expect(sendSlot).toHaveBeenCalledOnce()
  })

  it('stays quiet when the courier window is still the one told', async () => {
    const same = { ...told, deliveryDate: '2026-10-14', slotNotifiedWindow: '2026-10-14 07:06-09:06',
      deliveryWindowFrom: new Date('2026-10-14T06:06:00Z'), deliveryWindowTo: new Date('2026-10-14T08:06:00Z') }
    expect(await maybeSendSlotEmail('ord-1', same, true, same)).toBe(false)
  })

  it('never sends a courier window for a day other than the parcel\'s', async () => {
    const otherDay = { ...told, deliveryDate: '2026-10-15', slotNotifiedWindow: '2026-10-14 07:48-09:48',
      deliveryWindowFrom: new Date('2026-10-14T06:06:00Z'), deliveryWindowTo: new Date('2026-10-14T08:06:00Z') }
    expect(await maybeSendSlotEmail('ord-1', otherDay, true, otherDay)).toBe(false)
  })

  it('leaves a never-told courier window to the tracking job', async () => {
    const fresh = { ...told, slotNotifiedAt: null }
    expect(await maybeSendSlotEmail('ord-1', fresh, true, fresh)).toBe(false)
    expect(claimSlot).not.toHaveBeenCalled()
  })

  it('stays quiet with no earlier version to compare against', async () => {
    const after = { ...told, deliverySlotStart: '13:00', deliverySlotEnd: '15:00' }
    expect(await maybeSendSlotEmail('ord-1', after, true)).toBe(false)
  })
})
