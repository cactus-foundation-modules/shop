import { describe, expect, it } from 'vitest'
import {
  DiscountWindowInput,
  discountExpiryDay,
  discountExpiryInstant,
  discountWindowDay,
  discountWindowInstant,
  withDiscountWindowDays,
} from '@/modules/shop/lib/discount-window'

// A discount's start day and last day, into the instants the checkout compares
// against and back out again. The first bug this pins was an hour wide and only
// for half the year: the browser read "2026-09-28" as midnight UTC, which is 1am
// in London under BST, so a campaign "starting Monday" refused its first hour.
// The second was a day wide: "Expires 30 September" stopped as the 30th began,
// and the owner who picked it expected the whole of the 30th.

const LONDON = 'Europe/London'
const NEW_YORK = 'America/New_York'

// Every day from `from` for `count` days, as "YYYY-MM-DD".
function daysFrom(from: string, count: number): string[] {
  const start = Date.parse(`${from}T00:00:00Z`)
  return Array.from({ length: count }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10))
}

describe('discountWindowInstant', () => {
  it('makes a summer day midnight in London, not midnight UTC', () => {
    expect(discountWindowInstant('2026-09-28', LONDON)?.toISOString()).toBe('2026-09-27T23:00:00.000Z')
  })

  it('makes a winter day midnight in London, which is midnight UTC', () => {
    expect(discountWindowInstant('2026-12-01', LONDON)?.toISOString()).toBe('2026-12-01T00:00:00.000Z')
  })

  it('leaves a UTC site exactly where it always was', () => {
    expect(discountWindowInstant('2026-09-28', 'UTC')?.toISOString()).toBe('2026-09-28T00:00:00.000Z')
  })

  it('keeps a full instant exactly as sent', () => {
    expect(discountWindowInstant('2026-09-28T09:30:00.000Z', LONDON)?.toISOString()).toBe('2026-09-28T09:30:00.000Z')
  })

  // The update query tells "not sent" from "cleared", so neither may turn into
  // the other on the way through.
  it('passes undefined and null through untouched', () => {
    expect(discountWindowInstant(undefined, LONDON)).toBeUndefined()
    expect(discountWindowInstant(null, LONDON)).toBeNull()
  })
})

describe('discountWindowDay', () => {
  it('reads a London midnight back as the day it was picked on', () => {
    expect(discountWindowDay(new Date('2026-09-27T23:00:00.000Z'), LONDON)).toBe('2026-09-28')
  })

  // Rows saved before this fix hold midnight UTC. They still read back as the
  // day the owner picked, so opening and saving one does not move it.
  it('reads an older midnight-UTC value as the same day', () => {
    expect(discountWindowDay(new Date('2026-09-28T00:00:00.000Z'), LONDON)).toBe('2026-09-28')
  })

  it('reads an older midnight-UTC value as its own day on a site west of UTC', () => {
    // Written by the old form as midnight UTC on 28 September. New York is five
    // hours behind, so read there it was the 27th, and a save moved it back.
    expect(discountWindowDay(new Date('2026-09-28T00:00:00.000Z'), 'America/New_York')).toBe('2026-09-28')
    // New York's own midnight still reads as its own day.
    expect(discountWindowDay(new Date('2026-09-28T04:00:00.000Z'), 'America/New_York')).toBe('2026-09-28')
  })

  it('is null for no date', () => {
    expect(discountWindowDay(null, LONDON)).toBeNull()
  })

  it('round-trips through the form without walking the day back', () => {
    const saved = discountWindowInstant('2026-03-29', LONDON) as Date
    expect(discountWindowDay(saved, LONDON)).toBe('2026-03-29')
    const again = discountWindowInstant(discountWindowDay(saved, LONDON), LONDON) as Date
    expect(again.toISOString()).toBe(saved.toISOString())
  })
})

describe('discountExpiryInstant', () => {
  it('runs a summer last day to midnight at the end of it in London', () => {
    // Midnight as 1 October begins, under BST.
    expect(discountExpiryInstant('2026-09-30', LONDON)?.toISOString()).toBe('2026-09-30T23:00:00.000Z')
  })

  it('runs a winter last day to midnight at the end of it in London', () => {
    expect(discountExpiryInstant('2026-11-30', LONDON)?.toISOString()).toBe('2026-12-01T00:00:00.000Z')
  })

  it('runs a last day to the end of it on a UTC site', () => {
    expect(discountExpiryInstant('2026-09-30', 'UTC')?.toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it('runs a last day to the end of it in New York, summer and winter', () => {
    expect(discountExpiryInstant('2026-09-30', NEW_YORK)?.toISOString()).toBe('2026-10-01T04:00:00.000Z')
    expect(discountExpiryInstant('2026-12-01', NEW_YORK)?.toISOString()).toBe('2026-12-02T05:00:00.000Z')
  })

  // The day after is found on the calendar. Adding 24 hours to the start of the
  // day would stop the 23-hour day an hour late and the 25-hour one an hour early.
  it('ends the short and long days of a clock change at midnight, not 24 hours on', () => {
    // 29 March 2026: London's clocks go forward, a 23-hour day.
    expect(discountExpiryInstant('2026-03-29', LONDON)?.toISOString()).toBe('2026-03-29T23:00:00.000Z')
    // 25 October 2026: they go back, a 25-hour day.
    expect(discountExpiryInstant('2026-10-25', LONDON)?.toISOString()).toBe('2026-10-26T00:00:00.000Z')
    expect(discountExpiryInstant('2026-10-24', LONDON)?.toISOString()).toBe('2026-10-24T23:00:00.000Z')
    // New York's go forward on 8 March and back on 1 November.
    expect(discountExpiryInstant('2026-03-08', NEW_YORK)?.toISOString()).toBe('2026-03-09T04:00:00.000Z')
    expect(discountExpiryInstant('2026-11-01', NEW_YORK)?.toISOString()).toBe('2026-11-02T05:00:00.000Z')
  })

  it('carries over the end of a month, a year and February', () => {
    expect(discountExpiryInstant('2026-12-31', LONDON)?.toISOString()).toBe('2027-01-01T00:00:00.000Z')
    expect(discountExpiryInstant('2027-02-28', 'UTC')?.toISOString()).toBe('2027-03-01T00:00:00.000Z')
    expect(discountExpiryInstant('2028-02-28', 'UTC')?.toISOString()).toBe('2028-02-29T00:00:00.000Z')
  })

  it('keeps a full instant exactly as sent', () => {
    expect(discountExpiryInstant('2026-09-30T09:30:00.000Z', LONDON)?.toISOString()).toBe('2026-09-30T09:30:00.000Z')
    expect(discountExpiryInstant(Date.parse('2026-09-30T09:30:00.000Z'), LONDON)?.toISOString()).toBe('2026-09-30T09:30:00.000Z')
  })

  it('passes undefined and null through untouched', () => {
    expect(discountExpiryInstant(undefined, LONDON)).toBeUndefined()
    expect(discountExpiryInstant(null, LONDON)).toBeNull()
  })
})

describe('discountExpiryDay', () => {
  // The rows already in the table hold the instant a discount stops, and keep
  // meaning exactly that. One stopping as 1 October begins last worked on the 30th.
  it('reads a stop at midnight as 1 October begins as a last day of 30 September', () => {
    expect(discountExpiryDay(new Date('2026-09-30T23:00:00.000Z'), LONDON)).toBe('2026-09-30')
    expect(discountExpiryDay(new Date('2026-10-01T00:00:00.000Z'), 'UTC')).toBe('2026-09-30')
    expect(discountExpiryDay(new Date('2026-10-01T04:00:00.000Z'), NEW_YORK)).toBe('2026-09-30')
  })

  it('reads a winter London midnight as the day before it', () => {
    expect(discountExpiryDay(new Date('2026-12-01T00:00:00.000Z'), LONDON)).toBe('2026-11-30')
  })

  // The old form wrote "Expires 1 October" as midnight UTC on the 1st. In London
  // under BST that is 1am on the 1st; the owner meant the code to stop as the
  // 1st began, so its last day is the 30th.
  it('reads an older midnight-UTC expiry in BST as the day before its UTC day', () => {
    expect(discountExpiryDay(new Date('2026-10-01T00:00:00.000Z'), LONDON)).toBe('2026-09-30')
  })

  // In New York the same row is 8pm on 30 September. Read on the site's clock it
  // would be the 30th, and the last day would come out as the 29th.
  it('reads an older midnight-UTC expiry on a site west of UTC as the day before its UTC day', () => {
    expect(discountExpiryDay(new Date('2026-10-01T00:00:00.000Z'), NEW_YORK)).toBe('2026-09-30')
    expect(discountExpiryDay(new Date('2026-12-01T00:00:00.000Z'), NEW_YORK)).toBe('2026-11-30')
  })

  // An API client's instant part-way through the 30th: the last WHOLE day it
  // works is the 29th, and a save from the form trims the morning of the 30th
  // rather than handing out the rest of it.
  it('reads an instant part-way through a day as the last whole day before it', () => {
    const midMorning = new Date('2026-09-30T09:30:00.000Z')
    expect(discountExpiryDay(midMorning, LONDON)).toBe('2026-09-29')
    expect(discountExpiryInstant(discountExpiryDay(midMorning, LONDON), LONDON)?.toISOString()).toBe('2026-09-29T23:00:00.000Z')
  })

  it('is null for no date', () => {
    expect(discountExpiryDay(null, LONDON)).toBeNull()
  })
})

describe('saving, reopening and saving again', () => {
  const zones = [LONDON, 'UTC', NEW_YORK]
  // A whole year and into the next, so both clock changes in both zones are in
  // there, GMT and BST dates alike, plus February and New Year. Each day costs a
  // handful of timezone lookups, hence the roomier timeout under a busy suite.
  const days = daysFrom('2026-01-01', 367)
  const SWEEP_TIMEOUT_MS = 20_000

  it.each(zones)('never moves a start day in %s', (zone) => {
    for (const day of days) {
      const saved = discountWindowInstant(day, zone) as Date
      const shown = discountWindowDay(saved, zone)
      expect(shown, `${day} in ${zone}`).toBe(day)
      expect(discountWindowInstant(shown, zone)?.toISOString(), `${day} in ${zone}`).toBe(saved.toISOString())
    }
  }, SWEEP_TIMEOUT_MS)

  it.each(zones)('never moves a last day in %s', (zone) => {
    for (const day of days) {
      const saved = discountExpiryInstant(day, zone) as Date
      const shown = discountExpiryDay(saved, zone)
      expect(shown, `${day} in ${zone}`).toBe(day)
      expect(discountExpiryInstant(shown, zone)?.toISOString(), `${day} in ${zone}`).toBe(saved.toISOString())
    }
  }, SWEEP_TIMEOUT_MS)

  // The last day is a new way of SHOWING a stored expiry, not a new way of
  // storing one. Opening an existing row and saving it untouched stores
  // midnight at the start of the day it reads as stopping on - exactly what
  // saving it as an "Expires" day did - whatever wrote the row.
  it.each(zones)('saves an existing expiry back to the instant an "Expires" day did in %s', (zone) => {
    const existing = [
      '2026-10-01T00:00:00.000Z', // the old form's midnight UTC, BST season
      '2026-12-01T00:00:00.000Z', // the old form's midnight UTC, GMT season
      '2026-09-30T23:00:00.000Z', // London's own midnight under BST
      '2026-10-01T04:00:00.000Z', // New York's own midnight
      '2026-09-30T09:30:00.000Z', // an instant an API client sent
    ]
    for (const iso of existing) {
      const stored = new Date(iso)
      const asExpiresDay = discountWindowInstant(discountWindowDay(stored, zone), zone)
      const asLastDay = discountExpiryInstant(discountExpiryDay(stored, zone), zone)
      expect(asLastDay?.toISOString(), `${iso} in ${zone}`).toBe(asExpiresDay?.toISOString())
    }
  })
})

describe('withDiscountWindowDays', () => {
  it('adds the start day and the last day and keeps the instants', () => {
    const row = { id: 'c1', startsAt: new Date('2026-09-27T23:00:00.000Z'), expiresAt: new Date('2026-09-30T23:00:00.000Z') }
    expect(withDiscountWindowDays(row, LONDON)).toEqual({ ...row, startsOn: '2026-09-28', expiresOn: '2026-09-30' })
  })

  it('leaves an open-ended discount without either day', () => {
    const row = { id: 'c2', startsAt: null, expiresAt: null }
    expect(withDiscountWindowDays(row, LONDON)).toEqual({ ...row, startsOn: null, expiresOn: null })
  })
})

describe('DiscountWindowInput', () => {
  it('accepts a real day and an instant', () => {
    expect(DiscountWindowInput.safeParse('2026-09-28').success).toBe(true)
    expect(DiscountWindowInput.safeParse('2026-09-28T09:30:00.000Z').success).toBe(true)
  })

  it('refuses a day that is not one rather than rolling it into March', () => {
    expect(DiscountWindowInput.safeParse('2026-02-31').success).toBe(false)
  })

  it('refuses nonsense and an empty box', () => {
    expect(DiscountWindowInput.safeParse('next Tuesday').success).toBe(false)
    expect(DiscountWindowInput.safeParse('').success).toBe(false)
  })
})
