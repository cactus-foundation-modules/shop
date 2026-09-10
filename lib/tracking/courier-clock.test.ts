import { describe, expect, it } from 'vitest'
import { courierInstant } from '@/modules/shop/lib/tracking/courier-clock'

describe('courierInstant', () => {
  // The real one. DPD said 12:20 and the page said 13:20, because the instant
  // was built on the server's clock (UTC) and rendered in London.
  it('reads a summer wall clock as British Summer Time', () => {
    const instant = courierInstant('2026-09-10T12:20:00', 'Europe/London')
    expect(instant?.toISOString()).toBe('2026-09-10T11:20:00.000Z')
  })

  it('reads a winter wall clock as GMT', () => {
    expect(courierInstant('2026-01-14T09:05:00', 'Europe/London')?.toISOString())
      .toBe('2026-01-14T09:05:00.000Z')
  })

  it('handles a zone that is not the one we live in', () => {
    expect(courierInstant('2026-09-10T12:20:00', 'America/New_York')?.toISOString())
      .toBe('2026-09-10T16:20:00.000Z')
  })

  // The two-pass lookup earns its keep here: on the last Sunday in October the
  // same clock face happens twice, and a single pass lands an hour out.
  it('survives the morning the clocks go back', () => {
    expect(courierInstant('2026-10-25T01:30:00', 'Europe/London')?.toISOString())
      .toBe('2026-10-25T01:30:00.000Z')
  })

  it('accepts a space instead of a T, and seconds being absent', () => {
    expect(courierInstant('2026-09-10 12:20', 'Europe/London')?.toISOString())
      .toBe('2026-09-10T11:20:00.000Z')
  })

  // A courier who changes their format should cost one unreadable timestamp,
  // never a plausible wrong one.
  it('refuses anything that is not a bare wall clock', () => {
    expect(courierInstant('10/9/2026 12:20', 'Europe/London')).toBeNull()
    expect(courierInstant('2026-09-10T12:20:00Z', 'Europe/London')).toBeNull()
    expect(courierInstant(null, 'Europe/London')).toBeNull()
  })
})
