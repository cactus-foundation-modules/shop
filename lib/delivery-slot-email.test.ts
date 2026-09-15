import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as slotEmail from '@/modules/shop/lib/delivery-slot-email'
import { claimSlotNotification } from '@/modules/shop/lib/db/shipments'

vi.mock('@/modules/shop/lib/db/shipments', () => ({
  claimSlotNotification: vi.fn(),
}))

const parcel = {
  id: 'shp_1',
  orderId: 'ord_1',
  deliveryDate: null,
  deliverySlotStart: null,
  deliverySlotEnd: null,
  deliveryWindowFrom: null,
  deliveryWindowTo: null,
  slotNotifiedAt: null,
}

describe('maybeSendCarrierWindowEmail', () => {
  beforeEach(() => {
    vi.mocked(claimSlotNotification).mockReset()
    vi.mocked(claimSlotNotification).mockResolvedValue(true)
  })

  it('claims the right to send when the courier window appears for the first time', async () => {
    const sent = await slotEmail.maybeSendCarrierWindowEmail(
      parcel,
      {
        windowFrom: new Date('2026-09-15T10:25:00.000Z'),
        windowTo: new Date('2026-09-15T11:25:00.000Z'),
      },
      'Europe/London',
    )

    expect(sent).toBe(true)
    expect(claimSlotNotification).toHaveBeenCalledWith('shp_1', 'ord_1')
  })

  it('does nothing when the customer was already told', async () => {
    const sent = await slotEmail.maybeSendCarrierWindowEmail(
      { ...parcel, slotNotifiedAt: new Date('2026-09-15T08:00:00.000Z') },
      {
        windowFrom: new Date('2026-09-15T10:25:00.000Z'),
        windowTo: new Date('2026-09-15T11:25:00.000Z'),
      },
      'Europe/London',
    )

    expect(sent).toBe(false)
    expect(claimSlotNotification).not.toHaveBeenCalled()
  })

  it('does nothing when dispatch already has a complete booked slot', async () => {
    const sent = await slotEmail.maybeSendCarrierWindowEmail(
      {
        ...parcel,
        deliveryDate: '2026-09-15',
        deliverySlotStart: '10:00',
        deliverySlotEnd: '13:00',
      },
      {
        windowFrom: new Date('2026-09-15T10:25:00.000Z'),
        windowTo: new Date('2026-09-15T11:25:00.000Z'),
      },
      'Europe/London',
    )

    expect(sent).toBe(false)
    expect(claimSlotNotification).not.toHaveBeenCalled()
  })
})
