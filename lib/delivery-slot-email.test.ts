import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as slotEmail from '@/modules/shop/lib/delivery-slot-email'
import { claimMovedWindowNotification, claimSlotNotification } from '@/modules/shop/lib/db/shipments'

vi.mock('@/modules/shop/lib/db/shipments', () => ({
  claimSlotNotification: vi.fn(),
  claimMovedWindowNotification: vi.fn(),
  recordToldWindow: vi.fn(async () => undefined),
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
  slotNotifiedWindow: null,
}

describe('maybeSendCarrierWindowEmail', () => {
  beforeEach(() => {
    vi.mocked(claimSlotNotification).mockReset()
    vi.mocked(claimSlotNotification).mockResolvedValue(true)
    vi.mocked(claimMovedWindowNotification).mockReset()
    vi.mocked(claimMovedWindowNotification).mockResolvedValue(true)
  })

  it('claims the right to send when the courier window appears for the first time', async () => {
    const sent = await slotEmail.maybeSendCarrierWindowEmail(
      parcel,
      {
        windowFrom: new Date('2026-09-15T10:25:00.000Z'),
        windowTo: new Date('2026-09-15T11:25:00.000Z'),
      },
      'Europe/London',
      true,
    )

    expect(sent).toBe(true)
    expect(claimSlotNotification).toHaveBeenCalledWith('shp_1', 'ord_1')
  })

  it('never sends, or takes the stamp, for a courier whose page shows a holding window (AIT)', async () => {
    const sent = await slotEmail.maybeSendCarrierWindowEmail(
      parcel,
      {
        windowFrom: new Date('2026-10-14T06:48:00.000Z'),
        windowTo: new Date('2026-10-14T08:48:00.000Z'),
      },
      'Europe/London',
      false,
    )

    expect(sent).toBe(false)
    expect(claimSlotNotification).not.toHaveBeenCalled()
  })

  it('does nothing when the customer was already told', async () => {
    const sent = await slotEmail.maybeSendCarrierWindowEmail(
      { ...parcel, slotNotifiedAt: new Date('2026-09-15T08:00:00.000Z') },
      {
        windowFrom: new Date('2026-09-15T10:25:00.000Z'),
        windowTo: new Date('2026-09-15T11:25:00.000Z'),
      },
      'Europe/London',
      true,
    )

    expect(sent).toBe(false)
    expect(claimSlotNotification).not.toHaveBeenCalled()
  })

  it('does not send, or take the stamp, for a whole-day window - that is a day, not a time', async () => {
    const sent = await slotEmail.maybeSendCarrierWindowEmail(
      parcel,
      {
        windowFrom: new Date('2026-10-11T23:00:00.000Z'),
        windowTo: new Date('2026-10-12T22:59:59.000Z'),
      },
      'Europe/London',
      true,
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
      true,
    )

    expect(sent).toBe(false)
    expect(claimSlotNotification).not.toHaveBeenCalled()
  })

  describe('a customer already told a window, then rebooked for another day', () => {
    const told = {
      ...parcel,
      deliveryDate: '2026-10-17',
      slotNotifiedAt: new Date('2026-10-16T07:20:00.000Z'),
      slotNotifiedWindow: '2026-10-16 11:56-12:56',
    }
    const saturday = {
      windowFrom: new Date('2026-10-17T07:18:00.000Z'),
      windowTo: new Date('2026-10-17T08:18:00.000Z'),
    }

    it('tells them the new day, claiming against the window they were last emailed', async () => {
      const sent = await slotEmail.maybeSendCarrierWindowEmail(told, saturday, 'Europe/London', true)

      expect(sent).toBe(true)
      expect(claimMovedWindowNotification).toHaveBeenCalledWith('shp_1', 'ord_1', '2026-10-16 11:56-12:56', '2026-10-17 08:18-09:18')
      expect(claimSlotNotification).not.toHaveBeenCalled()
    })

    it('stays quiet when the window only drifts within the day they were told', async () => {
      const sent = await slotEmail.maybeSendCarrierWindowEmail(
        { ...told, slotNotifiedWindow: '2026-10-17 07:00-08:00' },
        saturday,
        'Europe/London',
        true,
      )

      expect(sent).toBe(false)
      expect(claimMovedWindowNotification).not.toHaveBeenCalled()
    })

    it('stays quiet when the courier window is not for the day on the parcel', async () => {
      const sent = await slotEmail.maybeSendCarrierWindowEmail({ ...told, deliveryDate: '2026-10-18' }, saturday, 'Europe/London', true)

      expect(sent).toBe(false)
      expect(claimMovedWindowNotification).not.toHaveBeenCalled()
    })

    it('stays quiet for a parcel told before the record of what went existed', async () => {
      const sent = await slotEmail.maybeSendCarrierWindowEmail({ ...told, slotNotifiedWindow: null }, saturday, 'Europe/London', true)

      expect(sent).toBe(false)
      expect(claimMovedWindowNotification).not.toHaveBeenCalled()
    })

    it('does not send twice when another run has already claimed the move', async () => {
      vi.mocked(claimMovedWindowNotification).mockResolvedValue(false)
      const sent = await slotEmail.maybeSendCarrierWindowEmail(told, saturday, 'Europe/London', true)

      expect(sent).toBe(false)
    })
  })
})
