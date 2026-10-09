import { describe, it, expect } from 'vitest'
import { currentDelay, delayIsNewerThanStage, isStaleCarrierWindow } from '@/modules/shop/lib/delivery-delay'
import { deliveryBookingForShipment, formatDeliveryWindow, formatDeliveryWindowSpoken, isWholeDayWindow } from '@/modules/shop/lib/delivery-slot'

describe('currentDelay', () => {
  it('is nothing when no delay was reported', () => {
    expect(currentDelay({}, '2026-10-09', '2026-10-09')).toBeNull()
  })

  it('reads "running late" as today only on the day it was said', () => {
    const late = { deliveryDelay: 'today' as const, deliveryDelayedFrom: '2026-10-09' }
    expect(currentDelay(late, '2026-10-09', '2026-10-09')).toBe('today')
    // The next morning it did not happen, and the promise left standing is the
    // new day to follow.
    expect(currentDelay(late, '2026-10-09', '2026-10-10')).toBe('rebooking')
  })

  it('closes once a day after the missed one is booked, by anybody', () => {
    const waiting = { deliveryDelay: 'rebooking' as const, deliveryDelayedFrom: '2026-10-09' }
    expect(currentDelay(waiting, '', '2026-10-09')).toBe('rebooking')
    expect(currentDelay(waiting, '2026-10-09', '2026-10-09')).toBe('rebooking')
    expect(currentDelay(waiting, '2026-10-13', '2026-10-10')).toBeNull()
  })

  it('closes when the parcel arrives', () => {
    const waiting = { deliveryDelay: 'rebooking' as const, deliveryDelayedFrom: '2026-10-09', deliveredAt: new Date() }
    expect(currentDelay(waiting, '', '2026-10-10')).toBeNull()
  })
})

describe('isStaleCarrierWindow', () => {
  it('treats the missed day as stale, except while still trying today', () => {
    expect(isStaleCarrierWindow({ deliveryDelay: 'rebooking', deliveryDelayedFrom: '2026-10-09' }, '2026-10-09')).toBe(true)
    expect(isStaleCarrierWindow({ deliveryDelay: 'today', deliveryDelayedFrom: '2026-10-09' }, '2026-10-09')).toBe(false)
    expect(isStaleCarrierWindow({ deliveryDelay: 'rebooking', deliveryDelayedFrom: '2026-10-09' }, '2026-10-12')).toBe(false)
    expect(isStaleCarrierWindow({}, '2026-10-09')).toBe(false)
  })

  it('stops the booking falling back to the window that fell through', () => {
    const parcel = {
      deliveryDate: null,
      deliverySlotStart: null,
      deliverySlotEnd: null,
      deliveryWindowFrom: new Date('2026-10-09T10:27:00Z'),
      deliveryWindowTo: new Date('2026-10-09T12:27:00Z'),
    }
    expect(deliveryBookingForShipment(parcel, 'Europe/London').date).toBe('2026-10-09')
    expect(deliveryBookingForShipment(
      { ...parcel, deliveryDelay: 'rebooking', deliveryDelayedFrom: '2026-10-09' },
      'Europe/London',
    ).date).toBe('')
  })
})

describe('delayIsNewerThanStage', () => {
  it('outranks a stage read before the delay was reported, not one read after', () => {
    const at = new Date('2026-10-09T12:00:00Z')
    expect(delayIsNewerThanStage('rebooking', { deliveryDelayedAt: at, trackingStageAt: new Date('2026-10-09T11:00:00Z') })).toBe(true)
    expect(delayIsNewerThanStage('rebooking', { deliveryDelayedAt: at, trackingStageAt: new Date('2026-10-09T13:00:00Z') })).toBe(false)
    expect(delayIsNewerThanStage(null, { deliveryDelayedAt: at })).toBe(false)
  })
})

describe('a whole-day courier window', () => {
  // The reading on DW000219: AIT booked Monday and gave no time, as
  // 23:00Z to 22:59:59Z - midnight to 23:59 in London.
  const aitDayOnly = {
    deliveryDate: '2026-10-12',
    deliverySlotStart: null,
    deliverySlotEnd: null,
    deliveryWindowFrom: new Date('2026-10-11T23:00:00Z'),
    deliveryWindowTo: new Date('2026-10-12T22:59:59Z'),
  }

  it('is the day with no window', () => {
    expect(deliveryBookingForShipment(aitDayOnly, 'Europe/London')).toEqual({ date: '2026-10-12', slotStart: null, slotEnd: null })
  })

  it('is never worded as a time', () => {
    expect(isWholeDayWindow('00:00', '23:59')).toBe(true)
    expect(isWholeDayWindow('10:00', '13:00')).toBe(false)
    expect(formatDeliveryWindow('00:00', '23:59')).toBe('')
    expect(formatDeliveryWindowSpoken('00:00', '23:59')).toBe('')
    expect(formatDeliveryWindowSpoken('10:00', '13:00')).toBe('between 10am and 1pm')
  })
})
