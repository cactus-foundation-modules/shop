// Reading a GFS parcel page.
//
// GFS (Global Freight Solutions) are a broker: suppliers book through them and
// they hand the parcel to a carrier. Their page is the RAW CARRIER SCAN FEED,
// which turns out to be better than what the carrier shows the public - DPD's
// own guest page says "DPD" where GFS names the depot, and says "your parcel
// will be with you today between 11:41 and 12:41" where GFS says
// "OUT FOR DELIVERY, ETA: 11:41 - 12:41". Scan codes are a small stable
// vocabulary; marketing sentences are not.
//
// It is also open: no postcode, no session, no reCAPTCHA, and no personal data
// on the page at all - no name, no address, no postcode. Only scans against a
// parcel number, which is why this reader can run on a schedule at all.
//
// Server-rendered ASP, one table, no script needs to run. Parsed here with
// regular expressions rather than a DOM library for the same reason the
// Multidrop reader is: the whole job is "read three cells out of each row", the
// page is one we do not control, and a parser in a scheduled route is a
// dependency and a memory footprint for no gain. Anything it cannot make sense
// of comes back as no events, which the caller treats as nothing learned.

import { textOf } from '@/modules/shop/lib/tracking/html-text'
import { EMPTY_READING, type TrackingEvent, type TrackingReading } from '@/modules/shop/lib/tracking/reading'

const BASE = 'https://tracking.justshoutgfs.com/ParcelLink.asp'

/**
 * Where to ask about one parcel.
 *
 * ConsNumber, ParcelNumber and Carrier are the whole key. The links suppliers
 * send also carry ItemNo and custid - the supplier's own GFS account - and
 * neither changes the answer: dropping them returns the identical page, while
 * dropping ConsNumber returns a 500. So this asks with what any shop can know
 * from the parcel number alone, and never needs the supplier's account number.
 */
export function gfsScanUrl(parcelNumber: string, carrier: string): string {
  const number = encodeURIComponent(parcelNumber.trim())
  return `${BASE}?ConsNumber=${number}&ParcelNumber=${number}&Carrier=${encodeURIComponent(carrier.trim())}`
}

/**
 * The parcel number GFS wants, out of whatever tracking link was recorded.
 *
 * A DPD link carries a parcel CODE - '15505217095248*21437' - whose leading
 * digits are the parcel number and whose tail is a suffix of theirs. Anything
 * else is read as digits, because that is what every carrier's parcel number
 * is and a link with none is not one this can use.
 */
export function gfsParcelNumberFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const digits = url.match(/(\d{10,20})/)
  return digits?.[1] ?? null
}

// Their table is <tr><td>date</td><td>location</td><td>scan text</td></tr>,
// with a header row of the same shape. Rows are taken apart cell by cell rather
// than by splitting on tags, because a scan text containing a stray '<' would
// otherwise eat the row after it.
const ROW = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
const CELL = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi

/** Their date column, 'D/M/YYYY HH:MM' - day first, and NOT parseable by
 *  `new Date`, which reads 10/9/2026 as the tenth of September in Britain and
 *  as the ninth of October in America. Taken apart by hand for that reason. */
const SCAN_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/

function pad(value: string, width = 2): string {
  return value.padStart(width, '0')
}

/** 'YYYY-MM-DDTHH:MM:SS' in GFS's own reckoning, or null if it is not a date.
 *  No timezone is applied: their feed carries no offset and guessing one would
 *  move every scan by an hour for half the year. */
export function parseGfsScanDate(value: string): string | null {
  const m = SCAN_DATE.exec(value.trim())
  if (!m) return null
  const [, day, month, year, hour, minute, second] = m as unknown as string[]
  const dayNum = Number(day)
  const monthNum = Number(month)
  const hourNum = Number(hour)
  // Their own page has never printed a bad one, but this reader runs unattended
  // against somebody else's output: a 32nd of the month is a page that changed
  // shape, not a date, and it must not become a Date that silently rolls over.
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31 || hourNum > 23) return null
  return `${year}-${pad(month as string)}-${pad(day as string)}T${pad(hour as string)}:${minute}:${second ? pad(second) : '00'}`
}

/**
 * Every scan on the page, newest first, as GFS print them.
 *
 * The header row is dropped by failing to parse its date rather than by
 * matching the words 'Date Location Scan text' - a header they reword stops
 * being recognised, while a header that is not a date never starts being one.
 */
export function parseGfsScans(html: string): TrackingEvent[] {
  const events: TrackingEvent[] = []
  for (const row of html.matchAll(ROW)) {
    const cells: string[] = []
    for (const cell of (row[1] ?? '').matchAll(CELL)) cells.push(textOf(cell[1] ?? ''))
    if (cells.length < 3) continue
    const at = parseGfsScanDate(cells[0] as string)
    if (!at) continue
    const text = (cells[2] as string).trim()
    if (!text) continue
    events.push({ at, location: (cells[1] as string).trim(), text })
  }
  // Newest first regardless of the order they printed them in. Their page has
  // always come back newest-first, and the reader must not be the thing that
  // finds out it changed.
  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

/** The window out of a scan like 'OUT FOR DELIVERY, ETA: 11:41 - 12:41', as
 *  instants on that scan's own day. Their ETA has no date of its own, and the
 *  only day it can sensibly mean is the day it was scanned. */
export function parseGfsEtaWindow(event: TrackingEvent): { from: Date; to: Date } | null {
  const m = /ETA:\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/i.exec(event.text)
  if (!m) return null
  const day = event.at.slice(0, 10)
  const from = new Date(`${day}T${pad(m[1] as string)}:${m[2]}:00`)
  const to = new Date(`${day}T${pad(m[3] as string)}:${m[4]}:00`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
  return { from, to }
}

/**
 * One reading off a GFS page.
 *
 * The stage is the newest scan's text, in their words, which the shop's own
 * per-courier settings turn into meaning. Their vocabulary is short and stable
 * - PARCEL DATA RECEIVED, ARRIVED AT HUB, OUT FOR DELIVERY, DELIVERED - but
 * this file states none of that: which scans mean "out on a van" is a setting,
 * because it is the part an owner can correct in a minute and a release cannot.
 */
export function readGfsPage(html: string): TrackingReading {
  const events = parseGfsScans(html)
  const newest = events[0]
  if (!newest) return { ...EMPTY_READING }
  const window = parseGfsEtaWindow(newest)
  return {
    ...EMPTY_READING,
    stage: newest.text,
    events,
    windowFrom: window?.from ?? null,
    windowTo: window?.to ?? null,
  }
}
