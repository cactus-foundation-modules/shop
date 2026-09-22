// When a coupon or an automatic discount starts and stops.
//
// The admin form asks for a DAY - "Starts 28 September" - and the column holds
// an instant. The browser used to turn one into the other itself, with
// `new Date('2026-09-28')`, and JavaScript reads a bare date as midnight UTC,
// not midnight in the shop. For the half of the year Britain is on BST that is
// 1am, so a campaign starting on Monday turned its first hour of shoppers away
// and one expiring on Friday kept working for the first hour of Friday.
//
// Every check that reads the instant - the coupon box (resolveDiscounts), the
// automatic rules (listAutomaticDiscounts), "is there any code to offer at all"
// (hasRedeemableCoupons) - compares instants with instants, so each was right
// about the moment it was handed. It was simply handed the wrong moment.
//
// So the day now travels as a day, and the server, which is the one place that
// knows the site's timezone, turns it into midnight there. A start day is
// midnight at the start of that day. An expiry day is the LAST day the discount
// works, so it becomes midnight at the start of the day after: pick 30 September
// and the code works all through the 30th and stops as 1 October begins, which
// is what anybody picking "30 September" meant. A full date-and-time is still
// accepted and kept exactly as sent, so nothing that posts an instant changes
// meaning.
//
// Only the day on the form moved. The column still holds the instant a discount
// stops and every check above still compares it with now, so no stored row and
// no check changed. A row holding midnight at the start of 1 October always
// stopped as 1 October began; the form used to call it "Expires 1 October" and
// now calls it "Last day 30 September", which is the same moment put the way
// people say it.
//
// Pure: no database here. The routes look the timezone up and pass it in.
import { z } from 'zod'
import { calendarDateIn, instantAtWallClock } from '@/lib/config/timezone'

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/

// "2026-02-31" is shaped like a day and is not one. Date.UTC would quietly roll
// it into March, which is the one outcome worse than refusing it.
function isRealDay(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isValidWindowInput(value: string | number): boolean {
  if (typeof value === 'string' && CALENDAR_DAY.test(value)) return isRealDay(value)
  return !Number.isNaN(new Date(value).getTime())
}

/** A start or expiry as the admin API accepts it: a calendar day
 *  ("2026-09-28"), or anything that already names an instant. */
export const DiscountWindowInput = z
  .union([z.string().trim().min(1), z.number()])
  .refine(isValidWindowInput, { message: 'Please pick a real date' })

export type DiscountWindowInput = z.infer<typeof DiscountWindowInput>

// A calendar day moved by whole days on the calendar, not the clock: the day
// after 28 March is 29 March whatever the clocks do that night. Adding 24 hours
// to an instant instead lands an hour out either side of a clock change: the
// 23-hour day in March would run an hour into the next, and the 25-hour day in
// October would stop an hour short.
function shiftDay(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10)
}

/**
 * The instant a start means. A calendar day is midnight at the start of that
 * day in the site's timezone; anything else is taken as the instant it already
 * is. `undefined` (the field was not sent) and `null` (it was cleared) pass
 * straight through, because the update query tells those two apart.
 */
export function discountWindowInstant(
  value: DiscountWindowInput | null | undefined,
  timezone: string,
): Date | null | undefined {
  if (value === undefined || value === null) return value
  if (typeof value === 'string' && CALENDAR_DAY.test(value)) return instantAtWallClock(value, '00:00', timezone)
  return new Date(value)
}

/**
 * The instant an expiry means. A calendar day is the last day the discount
 * works, so it becomes midnight at the start of the day AFTER it in the site's
 * timezone. Anything else is the instant it already is, and `undefined` and
 * `null` pass through exactly as they do for a start.
 */
export function discountExpiryInstant(
  value: DiscountWindowInput | null | undefined,
  timezone: string,
): Date | null | undefined {
  if (typeof value === 'string' && CALENDAR_DAY.test(value)) return discountWindowInstant(shiftDay(value, 1), timezone)
  return discountWindowInstant(value, timezone)
}

/** The day a stored instant falls on in the site's timezone - what the admin
 *  form shows and sends back as a start day, and the day after an expiry's last
 *  day. Reading it as a UTC slice would move a London-midnight value to the day
 *  before, and every save would then walk the campaign back a day. */
//
// One exception: a value sitting exactly on midnight UTC that is NOT midnight
// in the site's timezone is one the old form wrote - it turned the chosen day
// into midnight UTC in the browser - and it means that UTC day. Read in the
// site's timezone on a site west of UTC it came out as the day before, and the
// next save moved the campaign back a day. Midnight in the site's own timezone,
// which is everything written since, reads as its own day as before.
export function discountWindowDay(value: Date | null, timezone: string): string | null {
  if (!value) return null
  const utcMidnight = value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0
  if (utcMidnight) {
    const utcDay = value.toISOString().slice(0, 10)
    if (instantAtWallClock(utcDay, '00:00', timezone).getTime() !== value.getTime()) return utcDay
  }
  return calendarDateIn(value, timezone) || null
}

/** The last day a stored expiry lets the discount work - what the form shows
 *  as "Last day" and sends back. It is the day before the one the stored
 *  instant falls on, read by the rules above, so a row holding midnight at the
 *  start of 1 October reads as 30 September and saving that stores the same
 *  instant again. */
//
// The old form's midnight-UTC rows go through the same exception as a start. It
// wrote "Expires 1 October" as midnight UTC on the 1st, which is 1am on the 1st
// in London under BST and 8pm on 30 September in New York; either way the owner
// meant "stops as 1 October begins", the exception reads the 1st, and the last
// day is the 30th. Without it New York would read the 30th and show the 29th.
//
// An instant part-way through a day - an API client's "10:30 on the 30th" -
// also reads as the day before: the last WHOLE day it works. Saving it from the
// form then stores midnight at the start of the 30th, trimming the morning
// rather than handing out the rest of the day, and that is the same instant the
// form stored for it before expiry days were inclusive. Nothing moves on a
// re-save that did not move already.
export function discountExpiryDay(value: Date | null, timezone: string): string | null {
  const day = discountWindowDay(value, timezone)
  return day ? shiftDay(day, -1) : null
}

/** A coupon or automatic discount row with its start day and last day added,
 *  for the admin list. The instants stay as they are for anything else reading
 *  the list. */
export function withDiscountWindowDays<T extends { startsAt: Date | null; expiresAt: Date | null }>(
  row: T,
  timezone: string,
): T & { startsOn: string | null; expiresOn: string | null } {
  return {
    ...row,
    startsOn: discountWindowDay(row.startsAt, timezone),
    expiresOn: discountExpiryDay(row.expiresAt, timezone),
  }
}
