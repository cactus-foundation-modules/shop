// The reporting period every Reports tab works to: a from and a to day,
// inclusive, in the site's own timezone, and the same length immediately before
// it for the comparison.
//
// Days start at midnight where the shop is, not midnight UTC, for the reason
// app/api/admin/reports/tax/route.ts gives: a quarter ending 30 June ends at
// midnight in Britain, and read as UTC every summer period began an hour late.
import { instantAtWallClock } from '@/lib/config/timezone'

export type Grouping = 'day' | 'week' | 'month'

export type ReportPeriod = {
  /** yyyy-mm-dd, inclusive. */
  fromDay: string
  toDay: string
  /** Instants: from at midnight, to at the midnight AFTER toDay. */
  from: Date
  to: Date
  /** The same number of days immediately before. */
  previousFromDay: string
  previousToDay: string
  previousFrom: Date
  days: number
  grouping: Grouping
  timezone: string
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function isDay(raw: string | null | undefined): raw is string {
  if (!raw || !DAY.test(raw)) return false
  const check = new Date(`${raw}T00:00:00.000Z`)
  return !Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === raw
}

/** A yyyy-mm-dd moved by whole calendar days - not by 24 hours, as clocks change. */
export function addDays(day: string, n: number): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + n)
  return date.toISOString().slice(0, 10)
}

export function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000)
}

/** Today where the shop is, as yyyy-mm-dd. */
export function todayIn(timezone: string): string {
  // en-CA formats as yyyy-mm-dd.
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/**
 * The period a request asks for. Anything missing or unparseable falls back to
 * the last 30 days: a report is not worth a 400, and a month is what most people
 * open Reports to look at. A from after its to is swapped rather than refused.
 * Capped at ten years so a typo cannot ask the database for the Bronze Age.
 */
export function readPeriod(params: URLSearchParams, timezone: string): ReportPeriod {
  const today = todayIn(timezone)
  let toDay = isDay(params.get('to')) ? params.get('to')! : today
  let fromDay = isDay(params.get('from')) ? params.get('from')! : addDays(toDay, -29)
  if (fromDay > toDay) [fromDay, toDay] = [toDay, fromDay]
  if (daysBetween(fromDay, toDay) > 3660) fromDay = addDays(toDay, -3660)
  const days = daysBetween(fromDay, toDay) + 1

  const raw = params.get('group')
  const grouping: Grouping = raw === 'day' || raw === 'week' || raw === 'month'
    ? raw
    : days <= 45 ? 'day' : days <= 200 ? 'week' : 'month'

  const previousToDay = addDays(fromDay, -1)
  const previousFromDay = addDays(previousToDay, -(days - 1))
  return {
    fromDay,
    toDay,
    from: instantAtWallClock(fromDay, '00:00', timezone),
    to: instantAtWallClock(addDays(toDay, 1), '00:00', timezone),
    previousFromDay,
    previousToDay,
    previousFrom: instantAtWallClock(previousFromDay, '00:00', timezone),
    days,
    grouping,
    timezone,
  }
}

/** The start day of the bucket a day falls in - Monday for weeks, as Postgres has it. */
export function bucketOf(day: string, grouping: Grouping): string {
  if (grouping === 'day') return day
  if (grouping === 'month') return `${day.slice(0, 7)}-01`
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay() // 0 = Sunday
  return addDays(day, -((dow + 6) % 7))
}

/** Every bucket from one day to another, in order, gaps and all. */
export function bucketsBetween(fromDay: string, toDay: string, grouping: Grouping): string[] {
  const out: string[] = []
  let cursor = bucketOf(fromDay, grouping)
  const last = bucketOf(toDay, grouping)
  while (cursor <= last && out.length < 4000) {
    out.push(cursor)
    if (grouping === 'day') cursor = addDays(cursor, 1)
    else if (grouping === 'week') cursor = addDays(cursor, 7)
    else {
      const d = new Date(`${cursor}T00:00:00Z`)
      d.setUTCMonth(d.getUTCMonth() + 1)
      cursor = d.toISOString().slice(0, 10)
    }
  }
  return out
}
