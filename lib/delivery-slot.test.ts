import { describe, it, expect } from 'vitest'
import {
  deliveryProgress,
  formatClockTime,
  formatDeliveryDay,
  formatDeliveryDayRelative,
  formatDeliveryWindow,
  formatDeliveryWindowSpoken,
  isDeliveryDate,
  isSlotTime,
  nowInTimezone,
  ordinal,
} from '@/modules/shop/lib/delivery-slot'

describe('isDeliveryDate', () => {
  it('accepts a real day', () => {
    expect(isDeliveryDate('2026-09-08')).toBe(true)
  })

  it('rejects a day that does not exist, which the pattern alone allows', () => {
    expect(isDeliveryDate('2026-02-31')).toBe(false)
    expect(isDeliveryDate('2026-13-01')).toBe(false)
    expect(isDeliveryDate('2026-00-10')).toBe(false)
  })

  it('knows which Februaries have 29 days', () => {
    expect(isDeliveryDate('2028-02-29')).toBe(true)
    expect(isDeliveryDate('2026-02-29')).toBe(false)
  })

  it('rejects anything that is not the database spelling', () => {
    expect(isDeliveryDate('08/09/2026')).toBe(false)
    expect(isDeliveryDate('2026-9-8')).toBe(false)
    expect(isDeliveryDate(null)).toBe(false)
  })
})

describe('isSlotTime', () => {
  it('takes a 24-hour clock time', () => {
    expect(isSlotTime('00:00')).toBe(true)
    expect(isSlotTime('23:59')).toBe(true)
  })

  it('refuses what is not one', () => {
    expect(isSlotTime('24:00')).toBe(false)
    expect(isSlotTime('9:00')).toBe(false)
    expect(isSlotTime('10:60')).toBe(false)
    expect(isSlotTime('10am')).toBe(false)
  })
})

describe('ordinal', () => {
  it('handles the teens, which are the ones that catch people out', () => {
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(12)).toBe('12th')
    expect(ordinal(13)).toBe('13th')
  })

  it('handles the rest', () => {
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(4)).toBe('4th')
    expect(ordinal(21)).toBe('21st')
    expect(ordinal(22)).toBe('22nd')
    expect(ordinal(23)).toBe('23rd')
    expect(ordinal(30)).toBe('30th')
  })
})

describe('formatDeliveryDay', () => {
  it('says it the way somebody says it out loud', () => {
    expect(formatDeliveryDay('2026-09-08')).toBe('Tuesday 8th of September')
  })

  it('names the same day whatever the machine thinks the time is', () => {
    // The bug this guards: turning a calendar day into an instant and reading
    // it back somewhere west of UTC prints the day before.
    const previous = process.env.TZ
    try {
      process.env.TZ = 'Pacific/Honolulu'
      expect(formatDeliveryDay('2026-09-08')).toBe('Tuesday 8th of September')
    } finally {
      process.env.TZ = previous
    }
  })

  it('prints nothing for a date that is not one', () => {
    expect(formatDeliveryDay('08/09/2026')).toBe('')
    expect(formatDeliveryDay('')).toBe('')
  })
})

describe('formatDeliveryWindow', () => {
  it('needs both ends', () => {
    expect(formatDeliveryWindow('10:00', '13:00')).toBe('between 10:00 and 13:00')
    expect(formatDeliveryWindow('10:00', null)).toBe('')
    expect(formatDeliveryWindow(null, '13:00')).toBe('')
    expect(formatDeliveryWindow('10:00', 'lunchtime')).toBe('')
  })
})

describe('nowInTimezone', () => {
  it('reads the day and the time of day in the shop timezone, not the server one', () => {
    // 00:30 UTC on 9 September is still the 8th in New York, and the small
    // hours of the 9th in London.
    const instant = new Date('2026-09-09T00:30:00Z')
    expect(nowInTimezone(instant, 'America/New_York')).toEqual({ date: '2026-09-08', minutes: 20 * 60 + 30 })
    expect(nowInTimezone(instant, 'Europe/London')).toEqual({ date: '2026-09-09', minutes: 60 + 30 })
  })

  it('calls midnight 00:00 rather than 24:00', () => {
    expect(nowInTimezone(new Date('2026-09-08T23:00:00Z'), 'Europe/London').minutes).toBe(0)
  })
})

describe('deliveryProgress', () => {
  const slot = { slotStart: '10:00', slotEnd: '13:00', timezone: 'Europe/London' }

  it('parks the van before the day arrives', () => {
    expect(deliveryProgress({ ...slot, date: '2026-09-08', now: new Date('2026-09-07T15:00:00Z') }))
      .toEqual({ progress: 0, phase: 'upcoming' })
  })

  it('still parks it on the day itself until the window opens', () => {
    // 08:00 London.
    expect(deliveryProgress({ ...slot, date: '2026-09-08', now: new Date('2026-09-08T07:00:00Z') }))
      .toEqual({ progress: 0, phase: 'today' })
  })

  it('moves it across the window', () => {
    // 11:30 London is halfway through 10:00-13:00.
    const halfway = deliveryProgress({ ...slot, date: '2026-09-08', now: new Date('2026-09-08T10:30:00Z') })
    expect(halfway?.phase).toBe('during')
    expect(halfway?.progress).toBeCloseTo(0.5, 5)
  })

  it('arrives at the end of the window and stays there', () => {
    expect(deliveryProgress({ ...slot, date: '2026-09-08', now: new Date('2026-09-08T12:00:00Z') }))
      .toEqual({ progress: 1, phase: 'passed' })
    expect(deliveryProgress({ ...slot, date: '2026-09-08', now: new Date('2026-09-10T09:00:00Z') }))
      .toEqual({ progress: 1, phase: 'passed' })
  })

  it('does not interpolate across a window it has not been given', () => {
    expect(deliveryProgress({
      date: '2026-09-08', slotStart: null, slotEnd: null,
      now: new Date('2026-09-08T11:00:00Z'), timezone: 'Europe/London',
    })).toEqual({ progress: 0, phase: 'today' })
  })

  it('treats a backwards window as no window rather than a negative one', () => {
    expect(deliveryProgress({
      date: '2026-09-08', slotStart: '13:00', slotEnd: '10:00',
      now: new Date('2026-09-08T11:00:00Z'), timezone: 'Europe/London',
    })).toEqual({ progress: 0, phase: 'today' })
  })

  it('is nothing at all without a real date', () => {
    expect(deliveryProgress({ ...slot, date: '', now: new Date() })).toBeNull()
  })
})

describe('formatClockTime', () => {
  it('says it the way a person does', () => {
    expect(formatClockTime('10:00')).toBe('10am')
    expect(formatClockTime('13:00')).toBe('1pm')
    expect(formatClockTime('09:30')).toBe('9.30am')
    expect(formatClockTime('17:45')).toBe('5.45pm')
  })

  it('names midday and midnight rather than leaving somebody to guess', () => {
    // "12pm" is genuinely ambiguous to a lot of people, and a delivery window
    // is the wrong place to find that out.
    expect(formatClockTime('12:00')).toBe('midday')
    expect(formatClockTime('00:00')).toBe('midnight')
    expect(formatClockTime('12:30')).toBe('12.30pm')
    expect(formatClockTime('00:15')).toBe('12.15am')
  })

  it('prints nothing for a time that is not one', () => {
    expect(formatClockTime('25:00')).toBe('')
  })
})

describe('formatDeliveryWindowSpoken', () => {
  it('is the window a customer reads', () => {
    expect(formatDeliveryWindowSpoken('10:00', '13:00')).toBe('between 10am and 1pm')
  })

  it('needs both ends, same as the exact form', () => {
    expect(formatDeliveryWindowSpoken('10:00', null)).toBe('')
  })
})

describe('formatDeliveryDayRelative', () => {
  it('prefers the plain word where there is one', () => {
    expect(formatDeliveryDayRelative('2026-09-07', '2026-09-07')).toBe('today')
    expect(formatDeliveryDayRelative('2026-09-08', '2026-09-07')).toBe('tomorrow')
  })

  it('names the weekday for the rest of the coming week', () => {
    expect(formatDeliveryDayRelative('2026-09-09', '2026-09-07')).toBe('Wednesday')
    expect(formatDeliveryDayRelative('2026-09-13', '2026-09-07')).toBe('Sunday')
  })

  it('goes back to the date once a weekday would be ambiguous', () => {
    // Seven days out there are two Mondays in play, so the bare weekday stops
    // being an answer.
    expect(formatDeliveryDayRelative('2026-09-14', '2026-09-07')).toBe('Monday 14th of September')
  })

  it('does not say "tomorrow" about a day that has been', () => {
    expect(formatDeliveryDayRelative('2026-09-06', '2026-09-07')).toBe('Sunday 6th of September')
  })

  it('crosses a month end without arithmetic trouble', () => {
    expect(formatDeliveryDayRelative('2026-10-01', '2026-09-30')).toBe('tomorrow')
  })

  it('falls back to the full date when today is not known', () => {
    expect(formatDeliveryDayRelative('2026-09-08', '')).toBe('Tuesday 8th of September')
  })
})
