import { describe, it, expect } from 'vitest'
import { formatDeliveredDay, formatOrderDateTime } from '@/modules/shop/lib/order-display'

const LONDON = 'Europe/London'

describe('formatDeliveredDay', () => {
  it('speaks the day the way the arrangement above it does', () => {
    // The line it replaces reads "Arranged for Tuesday 8th of September", so
    // this reads "8th of September 2026" rather than "8 Sep 2026".
    expect(formatDeliveredDay(new Date('2026-09-08T13:23:00Z'), LONDON)).toBe('8th of September 2026')
  })

  it('gets the ordinal right where English is awkward about it', () => {
    expect(formatDeliveredDay(new Date('2026-09-01T09:00:00Z'), LONDON)).toBe('1st of September 2026')
    expect(formatDeliveredDay(new Date('2026-09-02T09:00:00Z'), LONDON)).toBe('2nd of September 2026')
    expect(formatDeliveredDay(new Date('2026-09-03T09:00:00Z'), LONDON)).toBe('3rd of September 2026')
    expect(formatDeliveredDay(new Date('2026-09-11T09:00:00Z'), LONDON)).toBe('11th of September 2026')
    expect(formatDeliveredDay(new Date('2026-09-21T09:00:00Z'), LONDON)).toBe('21st of September 2026')
  })

  it('names the day it was in the shop\'s own timezone', () => {
    // 23:30 UTC on the 8th is half past midnight on the 9th in London. A
    // delivery is remembered by the day it happened where it happened.
    expect(formatDeliveredDay(new Date('2026-06-08T23:30:00Z'), LONDON)).toBe('9th of June 2026')
    expect(formatDeliveredDay(new Date('2026-06-08T23:30:00Z'), 'UTC')).toBe('8th of June 2026')
  })

  it('says nothing for a date that is not one', () => {
    expect(formatDeliveredDay(new Date('nonsense'), LONDON)).toBe('')
  })
})

describe('formatOrderDateTime', () => {
  it('carries the time, because the question it answers is when it was signed', () => {
    expect(formatOrderDateTime(new Date('2026-09-08T13:23:00Z'), LONDON)).toBe('8 September 2026 at 14:23')
  })
})
