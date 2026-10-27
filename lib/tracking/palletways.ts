// Reading a Palletways consignment.
//
// Palletways are a pallet network: the collecting depot hands to a hub, the hub
// to the delivering depot, and the delivering depot's own lorry brings it. Their
// public status - tt_basic.php, the table their tracking page loads before it
// asks for a postcode - is open: no postcode, no session, nothing personal on
// it. One row: tracking ID, the day it is currently due, the consignment
// number, units and weight, and a status in their capitals ("AT DELIVERY
// DEPOT").
//
// The scans and the due-by TIME are on the full-details page, which wants the
// delivery postcode and turns away anything that did not come from their own
// site ("Direct access not permitted. Please consider using our API instead").
// That is a door they have shut on purpose, so this reader does not lean on it.
// The time comes instead from the courier's settings: Palletways sell by
// service, and the service is what fixes the time ("BY 1700" on a standard
// next-day pallet), not the parcel.
//
// Server-rendered PHP, one table, parsed with regular expressions for the same
// reason the GFS reader is. Anything it cannot make sense of comes back as no
// stage, which the caller treats as nothing learned.

import { courierInstant } from '@/modules/shop/lib/tracking/courier-clock'
import { textOf } from '@/modules/shop/lib/tracking/html-text'
import { EMPTY_READING, type TrackingReading } from '@/modules/shop/lib/tracking/reading'

const BASE = 'https://track2.palletways.com/tt_basic.php'

/** Where to ask about one consignment. */
export function palletwaysStatusUrl(id: string): string {
  return `${BASE}?dc_syscon=${encodeURIComponent(id.trim())}`
}

const ROW = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
const CELL = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi

/** Their 'D/M/YYYY' as 'YYYY-MM-DD', day first - see parseGfsScanDate for why
 *  `new Date` is not allowed near it. Null for anything that is not a date. */
export function parsePalletwaysDate(value: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim())
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** The status row, by its header names rather than its column positions:
 *  the two pages they serve order the same columns differently. */
export function parsePalletwaysStatus(html: string): { status: string; dueDate: string | null } | null {
  let header: string[] | null = null
  for (const row of html.matchAll(ROW)) {
    const cells: string[] = []
    for (const cell of (row[1] ?? '').matchAll(CELL)) cells.push(textOf(cell[1] ?? '').trim())
    if (!header) {
      if (cells.some((c) => /^status$/i.test(c))) header = cells
      continue
    }
    const at = (pattern: RegExp) => {
      const index = (header as string[]).findIndex((c) => pattern.test(c))
      return index >= 0 ? cells[index] ?? '' : ''
    }
    const status = at(/^status$/i)
    if (!status) continue
    // 'Currently Due' here, 'Currently Due By' on the full page with a time
    // after it; the day is the part before any time.
    const due = at(/^currently due/i).split(/\s+-\s+/)[0] ?? ''
    return { status, dueDate: parsePalletwaysDate(due) }
  }
  return null
}

/**
 * One reading off their status table.
 *
 * The due day becomes a window ending at `dueBy` (their service's cut-off,
 * 'HH:MM') and starting at midnight, which every surface words as "by 5pm".
 * With no dueBy it is the whole day, which reads as the day alone. The stage
 * is their status in their own words; which of those mean "on a lorry today"
 * or "delivered" is the owner's setting, as for every courier who reports
 * nothing but words.
 */
export function readPalletwaysStatus(html: string, timezone: string, dueBy: string): TrackingReading {
  const row = parsePalletwaysStatus(html)
  if (!row) return { ...EMPTY_READING }
  const end = /^([01]\d|2[0-3]):[0-5]\d$/.test(dueBy.trim()) ? dueBy.trim() : '23:59'
  const windowFrom = row.dueDate ? courierInstant(`${row.dueDate}T00:00:00`, timezone) : null
  const windowTo = row.dueDate ? courierInstant(`${row.dueDate}T${end}:00`, timezone) : null
  return {
    ...EMPTY_READING,
    stage: row.status,
    windowFrom: windowFrom && windowTo ? windowFrom : null,
    windowTo: windowFrom && windowTo ? windowTo : null,
  }
}
