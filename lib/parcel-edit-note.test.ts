import { describe, expect, it } from 'vitest'
import { parcelEditNote } from './parcel-edit-note'

const parcel = {
  deliveryDate: '2026-10-12', deliverySlotStart: null, deliverySlotEnd: null,
  carrier: 'AIT Home Delivery', trackingNumber: null, trackingUrl: 'https://aithd.com/kz0vkrz',
  notes: null, quietCustomerEmails: false,
}

describe('parcelEditNote', () => {
  it('records a new window and that the customer was emailed', () => {
    const note = parcelEditNote(parcel, { ...parcel, deliverySlotStart: '13:00', deliverySlotEnd: '15:00' },
      { wanted: true, deliveryEmailed: true, trackingEmailed: false })
    expect(note).toContain('Delivery changed to Monday 12th of October, between 13:00 and 15:00')
    expect(note).toContain('customer emailed')
  })

  it('says why no email went', () => {
    const after = { ...parcel, deliverySlotStart: '08:15', deliverySlotEnd: '10:15' }
    expect(parcelEditNote(parcel, after, { wanted: true, deliveryEmailed: false, trackingEmailed: false }))
      .toContain('already been told this day and window')
    expect(parcelEditNote(parcel, after, { wanted: false, deliveryEmailed: false, trackingEmailed: false }))
      .toContain('the email box was unticked')
    expect(parcelEditNote(parcel, { ...after, quietCustomerEmails: true }, { wanted: true, deliveryEmailed: false, trackingEmailed: false }))
      .toContain('recorded without telling them')
  })

  it('records tracking and courier changes', () => {
    const note = parcelEditNote(parcel, { ...parcel, carrier: 'DPD', trackingUrl: 'https://example.com/x' },
      { wanted: true, deliveryEmailed: false, trackingEmailed: true })
    expect(note).toContain('Courier changed to DPD.')
    expect(note).toContain('Tracking changed to https://example.com/x; customer emailed.')
  })

  it('writes nothing for a save that changed nothing', () => {
    expect(parcelEditNote(parcel, { ...parcel }, { wanted: true, deliveryEmailed: false, trackingEmailed: false })).toBeNull()
  })
})
