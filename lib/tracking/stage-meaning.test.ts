import { describe, it, expect } from 'vitest'
import { courierIsPolled, stageMeaning } from '@/modules/shop/lib/tracking/stage-meaning'

const furdeco = {
  trackingSource: 'multidrop' as const,
  outForDeliveryStages: ['Assigned to Crew', "You're Up Next"],
  deliveredStages: ['Complete'],
}

describe('stageMeaning', () => {
  it('reads the stages the owner has named', () => {
    expect(stageMeaning(furdeco, 'Assigned to Crew')).toBe('out-for-delivery')
    expect(stageMeaning(furdeco, "You're Up Next")).toBe('out-for-delivery')
    expect(stageMeaning(furdeco, 'Complete')).toBe('delivered')
  })

  it('says nothing about a stage nobody has classified', () => {
    // Progress is the safe answer: the parcel has moved, and the shop has no
    // business acting on words it was not told the meaning of.
    expect(stageMeaning(furdeco, 'Date Confirmed')).toBe('progress')
    expect(stageMeaning(furdeco, 'Deliverable Products Received at Depot')).toBe('progress')
  })

  it('forgives the capitals and spacing of a settings box', () => {
    expect(stageMeaning(furdeco, '  assigned to crew ')).toBe('out-for-delivery')
    expect(stageMeaning({ ...furdeco, deliveredStages: [' complete '] }, 'Complete')).toBe('delivered')
  })

  it('lets delivered win a stage listed in both, since that stops the chasing', () => {
    const muddled = { ...furdeco, outForDeliveryStages: ['Complete'], deliveredStages: ['Complete'] }
    expect(stageMeaning(muddled, 'Complete')).toBe('delivered')
  })

  it('is progress for a courier that was never configured, or no stage at all', () => {
    expect(stageMeaning(null, 'Complete')).toBe('progress')
    expect(stageMeaning(furdeco, null)).toBe('progress')
    expect(stageMeaning(furdeco, '')).toBe('progress')
  })

  it('concludes nothing for a courier with empty lists', () => {
    const unconfigured = { trackingSource: 'multidrop' as const, outForDeliveryStages: [], deliveredStages: [] }
    expect(stageMeaning(unconfigured, 'Complete')).toBe('progress')
  })
})

describe('courierIsPolled', () => {
  it('is only true for a courier set to a tracking source', () => {
    expect(courierIsPolled({ trackingSource: 'multidrop' })).toBe(true)
    expect(courierIsPolled({ trackingSource: 'none' })).toBe(false)
    expect(courierIsPolled(null)).toBe(false)
  })
})

// Carriers staple the day's detail onto the stage itself, so the words an owner
// typed are only ever part of what comes back.
describe('stages with the courier own detail stapled on', () => {
  const courier = {
    outForDeliveryStages: ['OUT FOR DELIVERY'],
    deliveredStages: ['DELIVERED'],
  }

  it('matches the part the owner actually typed', () => {
    expect(stageMeaning(courier, 'OUT FOR DELIVERY, ETA: 11:41 - 12:41')).toBe('out-for-delivery')
    expect(stageMeaning(courier, 'DELIVERED, SIGNED FOR BY MOTHER')).toBe('delivered')
  })

  // The whole reason this is segment matching and not a substring test. A shop
  // whose orders completed themselves on a failed delivery would be worse off
  // than one with no automation at all.
  it('never matches a stage that merely contains the word', () => {
    expect(stageMeaning(courier, 'NOT DELIVERED - CUSTOMER NOT IN')).toBe('progress')
    expect(stageMeaning(courier, 'ATTEMPTED DELIVERY')).toBe('progress')
    expect(stageMeaning(courier, 'PARCEL WILL BE DELIVERED TOMORROW')).toBe('progress')
  })

  it('still matches a tidy stage whole, as it always did', () => {
    expect(stageMeaning({ ...courier, deliveredStages: ['Complete'] }, 'Complete')).toBe('delivered')
  })

  it('matches DPD out-for-delivery when only the window changed', () => {
    const dpd = {
      outForDeliveryStages: ['Your parcel will be with you today  between 11:41 and 12:41'],
      deliveredStages: [] as string[],
    }
    expect(stageMeaning(dpd, 'Your parcel will be with you today  between 11:25 and 12:25')).toBe('out-for-delivery')
  })
})
