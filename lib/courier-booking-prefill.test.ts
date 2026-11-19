import { describe, it, expect } from 'vitest'
import { courierPrefill, prefillUsed, withoutUntouchedPrefill } from '@/modules/shop/lib/courier-booking-prefill'

const empty = { deliveryDate: null, deliverySlotStart: null, deliverySlotEnd: null }

describe('courierPrefill', () => {
  it('fills a blank parcel from the courier window the order page shows', () => {
    const prefill = courierPrefill(empty, { date: '2026-11-20', slotStart: '10:00', slotEnd: '13:00' })
    expect(prefill).toEqual({ deliveryDate: '2026-11-20', deliverySlotStart: '10:00', deliverySlotEnd: '13:00' })
    expect(prefillUsed(empty, prefill)).toBe(true)
  })

  it('leaves out a due-by deadline altogether, day and all (DW000285, Palletways by 17:00)', () => {
    const prefill = courierPrefill(empty, { date: '2026-11-20', slotStart: '00:00', slotEnd: '17:00' })
    expect(prefill).toEqual({ deliveryDate: '', deliverySlotStart: '', deliverySlotEnd: '' })
    expect(prefillUsed(empty, prefill)).toBe(false)
  })

  it('keeps the parcel own day beside a due-by deadline, without the deadline', () => {
    const parcel = { ...empty, deliveryDate: '2026-11-20' }
    const prefill = courierPrefill(parcel, { date: '2026-11-20', slotStart: '00:00', slotEnd: '17:00' })
    expect(prefill).toEqual({ deliveryDate: '2026-11-20', deliverySlotStart: '', deliverySlotEnd: '' })
  })

  it('fills the day alone for a booked day with no time', () => {
    const prefill = courierPrefill(empty, { date: '2026-11-20', slotStart: null, slotEnd: null })
    expect(prefill).toEqual({ deliveryDate: '2026-11-20', deliverySlotStart: '', deliverySlotEnd: '' })
  })

  it('never overrides a slot the parcel has of its own', () => {
    const parcel = { deliveryDate: '2026-11-21', deliverySlotStart: '08:00', deliverySlotEnd: '12:00' }
    expect(courierPrefill(parcel, { date: '2026-11-21', slotStart: '08:00', slotEnd: '12:00' }))
      .toEqual({ deliveryDate: '2026-11-21', deliverySlotStart: '08:00', deliverySlotEnd: '12:00' })
  })

  it('fills courier times under a typed day only when they are for that day', () => {
    const parcel = { ...empty, deliveryDate: '2026-11-20' }
    expect(courierPrefill(parcel, { date: '2026-11-20', slotStart: '09:00', slotEnd: '11:00' }).deliverySlotStart).toBe('09:00')
    expect(courierPrefill(parcel, { date: '2026-11-22', slotStart: '09:00', slotEnd: '11:00' }).deliverySlotStart).toBe('')
  })

  it('returns the parcel own values when there is no booking', () => {
    expect(courierPrefill(empty, undefined)).toEqual({ deliveryDate: '', deliverySlotStart: '', deliverySlotEnd: '' })
  })
})

describe('withoutUntouchedPrefill', () => {
  const prefill = { deliveryDate: '2026-11-20', deliverySlotStart: '10:00', deliverySlotEnd: '13:00' }

  it('sends the courier values back blank when nothing was touched', () => {
    const sent = withoutUntouchedPrefill({ ...prefill, notes: 'x' }, empty, prefill)
    expect(sent).toEqual({ deliveryDate: '', deliverySlotStart: '', deliverySlotEnd: '', notes: 'x' })
  })

  it('keeps the whole booking when the times were changed', () => {
    const details = { ...prefill, deliverySlotStart: '11:00' }
    expect(withoutUntouchedPrefill(details, empty, prefill)).toEqual(details)
  })

  it('drops the courier times when the day was moved and the times left alone', () => {
    const details = { ...prefill, deliveryDate: '2026-11-21' }
    expect(withoutUntouchedPrefill(details, empty, prefill))
      .toEqual({ deliveryDate: '2026-11-21', deliverySlotStart: '', deliverySlotEnd: '' })
  })

  it('keeps a day the parcel had of its own when only the times were filled', () => {
    const parcel = { ...empty, deliveryDate: '2026-11-20' }
    expect(withoutUntouchedPrefill(prefill, parcel, prefill))
      .toEqual({ deliveryDate: '2026-11-20', deliverySlotStart: '', deliverySlotEnd: '' })
  })

  it('passes a form with nothing filled straight through', () => {
    const details = { deliveryDate: '2026-11-25', deliverySlotStart: '', deliverySlotEnd: '' }
    const none = { deliveryDate: '', deliverySlotStart: '', deliverySlotEnd: '' }
    expect(withoutUntouchedPrefill(details, empty, none)).toEqual(details)
  })
})
