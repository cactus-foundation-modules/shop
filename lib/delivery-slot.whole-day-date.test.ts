import { describe, it, expect } from 'vitest'
import { wholeDayWindowDate } from './delivery-slot'

const TZ = 'Europe/London'

describe('wholeDayWindowDate', () => {
  it('reads the day off a courier day sent as the whole day (Fieldly, DW000284)', () => {
    expect(wholeDayWindowDate(new Date('2026-11-26T00:00:00Z'), new Date('2026-11-26T23:59:00Z'), TZ)).toBe('2026-11-26')
  })

  it('reads it in the shop timezone, not UTC', () => {
    // 00:00-23:59 London in summer is 23:00 the day before to 22:59 UTC.
    expect(wholeDayWindowDate(new Date('2026-07-09T23:00:00Z'), new Date('2026-07-10T22:59:00Z'), TZ)).toBe('2026-07-10')
  })

  it('is null for a real window', () => {
    expect(wholeDayWindowDate(new Date('2026-11-26T10:00:00Z'), new Date('2026-11-26T13:00:00Z'), TZ)).toBeNull()
  })

  it('is null for a due-by deadline', () => {
    expect(wholeDayWindowDate(new Date('2026-11-26T00:00:00Z'), new Date('2026-11-26T17:00:00Z'), TZ)).toBeNull()
  })

  it('is null with either end missing', () => {
    expect(wholeDayWindowDate(null, new Date('2026-11-26T23:59:00Z'), TZ)).toBeNull()
    expect(wholeDayWindowDate(new Date('2026-11-26T00:00:00Z'), null, TZ)).toBeNull()
  })
})
