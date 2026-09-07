// The delivery day and its time window: validating them, wording them, and
// working out how far through the window the day has got.
//
// Pure, and it takes the clock as an argument, because every one of these is
// something two different surfaces have to agree on to the letter - the email
// that names the day, the order page that names it again, and the van on the
// progress rail that has to be in the same place on the server's first render
// as it is on the client's next tick.
//
// TIMEZONES ARE THE WHOLE JOB HERE.
//
// A delivery day is a day in the customer's world. It is never an instant, and
// the moment it is turned into one - a Date, a UTC midnight, an ISO string with
// a Z on the end - it starts printing as the day before for anybody west of
// UTC, and "your delivery is Monday" becomes a lie told confidently. So the day
// stays 'YYYY-MM-DD' and the window stays 'HH:MM' from the database all the way
// to the page, and the only thing ever converted is NOW: the current instant is
// read in the shop's timezone and compared like for like.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/** The three numbers in a 'YYYY-MM-DD' string. Indexed rather than
 *  destructured because every element of a split is possibly-undefined to the
 *  compiler, and the pattern above has already settled that they are not. */
function dateParts(value: string): { year: number; month: number; day: number } {
  const parts = value.split('-')
  return { year: Number(parts[0]), month: Number(parts[1]), day: Number(parts[2]) }
}

/** A real calendar day, written 'YYYY-MM-DD'. Rejects 2026-02-31, which the
 *  pattern alone is happy with. */
export function isDeliveryDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const { year, month, day } = dateParts(value)
  if (month < 1 || month > 12 || day < 1) return false
  // Day 0 of the following month is the last day of this one, and Date's UTC
  // constructor is safe here precisely because nothing about this is a moment -
  // it is arithmetic on a calendar, thrown away immediately.
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** A 24-hour clock time, written 'HH:MM'. */
export function isSlotTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value)
}

/** Minutes since midnight, for comparing times of day without dates. */
export function slotMinutes(time: string): number {
  const parts = time.split(':')
  return Number(parts[0]) * 60 + Number(parts[1])
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st. */
export function ordinal(day: number): string {
  const tens = day % 100
  if (tens >= 11 && tens <= 13) return `${day}th`
  switch (day % 10) {
    case 1: return `${day}st`
    case 2: return `${day}nd`
    case 3: return `${day}rd`
    default: return `${day}th`
  }
}

/**
 * "Tuesday 8th of September" - the day as somebody says it out loud.
 *
 * Deliberately no year: a delivery is days away, not months, and "Tuesday 8th
 * of September 2026" reads like a solicitor's letter. Deliberately no
 * Intl.DateTimeFormat either - the input is a calendar day with no timezone,
 * and handing it to a formatter means inventing an instant first.
 *
 * Empty string for anything that is not a real date, so a bad row cannot put
 * "Invalid Date" in front of a customer.
 */
export function formatDeliveryDay(date: string): string {
  if (!isDeliveryDate(date)) return ''
  const { year, month, day } = dateParts(date)
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? ''
  return `${weekday} ${ordinal(day)} of ${MONTHS[month - 1] ?? ''}`
}

/** "between 10:00 and 13:00", or '' unless both ends are real times. */
export function formatDeliveryWindow(start: string | null, end: string | null): string {
  if (!isSlotTime(start) || !isSlotTime(end)) return ''
  return `between ${start} and ${end}`
}

/** Today's date and time of day, in the shop's timezone rather than the
 *  server's. 'en-CA' because it is the locale that spells a date the way the
 *  database does; h23 because midnight is 00, not 24. */
export function nowInTimezone(now: Date, timezone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)

  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '00'
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

export type DeliveryProgress = {
  /** Where the van sits between "dispatched" and "delivered", 0 to 1. */
  progress: number
  /** Before the day, waiting on the day, inside the window, or past it. */
  phase: 'upcoming' | 'today' | 'during' | 'passed'
}

/**
 * How far through the delivery the clock has got.
 *
 * The van only moves during the window itself. Before it, it is parked at the
 * dispatched end; after it, it has arrived - which is not the same as the order
 * being complete, and the rail says so by leaving Complete unticked until
 * somebody or something confirms it.
 *
 * A delivery with a day but no window can only ever be 'upcoming' or 'today':
 * there is nothing to interpolate across, and guessing a window would put a van
 * halfway along a rail on no evidence at all.
 */
export function deliveryProgress(input: {
  date: string
  slotStart: string | null
  slotEnd: string | null
  now: Date
  timezone: string
}): DeliveryProgress | null {
  if (!isDeliveryDate(input.date)) return null

  const local = nowInTimezone(input.now, input.timezone)
  if (local.date < input.date) return { progress: 0, phase: 'upcoming' }
  if (local.date > input.date) return { progress: 1, phase: 'passed' }

  const start = isSlotTime(input.slotStart) ? slotMinutes(input.slotStart) : null
  const end = isSlotTime(input.slotEnd) ? slotMinutes(input.slotEnd) : null
  // A window that ends before it starts is a typo the route should have caught.
  // Treated as no window rather than as a negative one, which would put the van
  // through the back of the rail.
  if (start === null || end === null || end <= start) return { progress: 0, phase: 'today' }

  if (local.minutes <= start) return { progress: 0, phase: 'today' }
  if (local.minutes >= end) return { progress: 1, phase: 'passed' }
  return { progress: (local.minutes - start) / (end - start), phase: 'during' }
}
