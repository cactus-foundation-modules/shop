import { describe, expect, it } from 'vitest'
import { windowForParcelOutToday } from '@/modules/shop/lib/tracking/out-for-delivery-window'

const tz = 'Europe/London'
// 27 October 2026, 13:00 in London (GMT by then, so UTC too).
const now = new Date('2026-10-27T13:00:00Z')
// Palletways' "due 28/10/2026", carried as midnight to their 17:00 cut-off.
const tomorrow = { windowFrom: new Date('2026-10-28T00:00:00Z'), windowTo: new Date('2026-10-28T17:00:00Z') }

describe('windowForParcelOutToday', () => {
  it('moves a later day to today, keeping the times, when the parcel is out', () => {
    expect(windowForParcelOutToday(tomorrow, true, now, tz)).toEqual({
      windowFrom: new Date('2026-10-27T00:00:00Z'),
      windowTo: new Date('2026-10-27T17:00:00Z'),
    })
  })

  it('leaves a later day alone when the parcel is not out', () => {
    expect(windowForParcelOutToday(tomorrow, false, now, tz)).toBe(tomorrow)
  })

  it("leaves today's window alone", () => {
    const today = { windowFrom: new Date('2026-10-27T10:00:00Z'), windowTo: new Date('2026-10-27T12:00:00Z') }
    expect(windowForParcelOutToday(today, true, now, tz)).toBe(today)
  })

  it('leaves no window as no window', () => {
    const none = { windowFrom: null, windowTo: null }
    expect(windowForParcelOutToday(none, true, now, tz)).toBe(none)
  })

  it('reads today in the shop timezone, not UTC', () => {
    // 23:30 UTC on 30 June is 00:30 on 1 July in London: a window for the 1st
    // is today, not tomorrow.
    const lateJune = new Date('2026-06-30T23:30:00Z')
    const first = { windowFrom: new Date('2026-06-30T23:00:00Z'), windowTo: new Date('2026-07-01T16:00:00Z') }
    expect(windowForParcelOutToday(first, true, lateJune, tz)).toBe(first)
  })
})
