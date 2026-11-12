// Reading a Palletways consignment.
//
// Palletways are a pallet network: the collecting depot hands to a hub, the hub
// to the delivering depot, and the delivering depot's own lorry brings it.
// Their track and trace is two pages.
//
// tt_basic.php is open: no postcode, no session, nothing personal on it. One
// row: tracking ID, the day it is currently due, the consignment number, units
// and weight, and a status in their capitals ("AT DELIVERY DEPOT").
//
// tt2.php is the full details, and the only place the proof of delivery lives:
// every scan, the due-by TIME, who signed and when, a photograph of the pallet
// where it was left, and the signed delivery note. It wants the delivery
// postcode - the same thing their own page asks the customer for - and turns
// away a request that did not come from their own page ("Direct access not
// permitted"), which in practice means one without their page as the Referer.
// We are the sender asking about our own consignment with the address we sent
// it to, so it is read the way their page reads it. Where there is no postcode
// to give, or the details page will not answer, the basic table is read
// instead and the time comes from the courier's settings: Palletways sell by
// service, and the service is what fixes the time ("BY 1700" on a standard
// next-day pallet), not the parcel.
//
// Server-rendered PHP, plain tables, parsed with regular expressions for the
// same reason the GFS reader is. Anything it cannot make sense of comes back as
// no stage, which the caller treats as nothing learned.

import { courierInstant } from '@/modules/shop/lib/tracking/courier-clock'
import { textOf } from '@/modules/shop/lib/tracking/html-text'
import { EMPTY_READING, type TrackingEvent, type TrackingReading } from '@/modules/shop/lib/tracking/reading'

const ORIGIN = 'https://track2.palletways.com'

/** Where to ask about one consignment, openly. */
export function palletwaysStatusUrl(id: string): string {
  return `${ORIGIN}/tt_basic.php?dc_syscon=${encodeURIComponent(id.trim())}`
}

/** Where the full details are, for the consignment and its delivery postcode. */
export function palletwaysDetailsUrl(id: string, postcode: string): string {
  return `${ORIGIN}/tt2.php?dc_syscon=${encodeURIComponent(id.trim())}&postcode=${encodeURIComponent(postcode.trim())}`
}

/** What the details page and its pictures expect to have been asked from:
 *  their own public page for the consignment, which is where the customer's
 *  browser would have come from. */
export function palletwaysRequestHeaders(id: string): Record<string, string> {
  return { referer: `${ORIGIN}/index.php?dc_syscon=${encodeURIComponent(id.trim())}` }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
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
export function parsePalletwaysStatus(
  html: string,
): { status: string; dueDate: string | null; dueTime: string | null } | null {
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
    // 'Currently Due' on the basic table, 'Currently Due By' on the full page
    // with a time after it ('12/11/2026 - 17:00').
    const [day = '', time = ''] = at(/^currently due/i).split(/\s+-\s+/)
    return { status, dueDate: parsePalletwaysDate(day), dueTime: HHMM.test(time.trim()) ? time.trim() : null }
  }
  return null
}

/**
 * One reading off their status table.
 *
 * The due day becomes a window ending at the page's own due-by time where it
 * prints one (the full details do), else at `dueBy` (their service's cut-off
 * from the courier's settings, 'HH:MM'), and starting at midnight, which every surface words as "by 5pm".
 * With no dueBy it is the whole day, which reads as the day alone. The stage
 * is their status in their own words; which of those mean "on a lorry today"
 * or "delivered" is the owner's setting, as for every courier who reports
 * nothing but words.
 */
export function readPalletwaysStatus(html: string, timezone: string, dueBy: string): TrackingReading {
  const row = parsePalletwaysStatus(html)
  if (!row) return { ...EMPTY_READING }
  const end = row.dueTime ?? (HHMM.test(dueBy.trim()) ? dueBy.trim() : '23:59')
  const windowFrom = row.dueDate ? courierInstant(`${row.dueDate}T00:00:00`, timezone) : null
  const windowTo = row.dueDate ? courierInstant(`${row.dueDate}T${end}:00`, timezone) : null
  return {
    ...EMPTY_READING,
    stage: row.status,
    windowFrom: windowFrom && windowTo ? windowFrom : null,
    windowTo: windowFrom && windowTo ? windowTo : null,
  }
}

/** A picture their page links to, as the full-size address to fetch. */
export type PalletwaysProofImage = { url: string; label: 'delivery-photo' | 'delivery-note' }

export type PalletwaysDetails = TrackingReading & {
  /** The photograph of the pallet where it was left. */
  photo: PalletwaysProofImage | null
  /** The delivery note with the receiver's name and signature on it - the
   *  signed paperwork, which is what "proof of delivery" means to a haulier. */
  deliveryNote: PalletwaysProofImage | null
}

/** One row of their notes table: the type, the comments cell as HTML (it
 *  holds the picture links), and the date and time columns. */
type NoteRow = { type: string; commentsHtml: string; date: string; time: string }

function noteRows(html: string): NoteRow[] {
  const table = /<table[^>]*id=['"]tbl_notes['"][^>]*>([\s\S]*?)<\/table>/i.exec(html)?.[1]
  if (!table) return []
  const rows: NoteRow[] = []
  for (const row of table.matchAll(ROW)) {
    const cells: string[] = []
    for (const cell of (row[1] ?? '').matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)) cells.push(cell[1] ?? '')
    // Type, Number, Barcode, Comments, Date, Time. The header row has no <td>.
    if (cells.length < 6) continue
    rows.push({
      type: textOf(cells[0] ?? ''),
      commentsHtml: cells[3] ?? '',
      date: textOf(cells[4] ?? ''),
      time: textOf(cells[5] ?? ''),
    })
  }
  return rows
}

/** The file one of their picture rows links to. Their own name for it, which
 *  is all show_pod.php wants. */
function podFile(commentsHtml: string): string | null {
  const m = /show_pod\.php\?[^"'>\s]*?file=([^"'&>\s]+)/i.exec(commentsHtml)
  if (!m?.[1]) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return null
  }
}

/** The full-size picture, which they serve as a JPEG whatever the file is
 *  called - the delivery note is "….tif" and arrives as a JPEG. The bytes
 *  decide the type when it is kept (signature-capture.ts), not this name. */
export function palletwaysPodImageUrl(file: string): string {
  return `${ORIGIN}/show_pod.php?fullsize=true&file=${encodeURIComponent(file)}`
}

/** 'D/M/YYYY' and 'HH:MM' as their wall-clock 'YYYY-MM-DDTHH:MM:00'. */
function noteAt(date: string, time: string): string | null {
  const day = parsePalletwaysDate(date)
  return day && HHMM.test(time.trim()) ? `${day}T${time.trim()}:00` : null
}

/**
 * Everything the full-details page says.
 *
 * The status and due-by come off the same table the basic page has (with a
 * time this time). The notes table is their history, newest first: scans at
 * depots and hubs, the ETA they texted, and, once it is done, three rows that
 * are the proof of delivery - a "… POD" row with the receiver ("Alan @ 09:34
 * 2026-11-12" on a CLEAN POD; a damaged or short delivery is a different word
 * before POD), a "POD Photo" linking the photograph, and an "IMAGE SCANNED"
 * linking the signed delivery note.
 *
 * `delivered` stays null: which status words mean delivered is the owner's
 * setting, exactly as on the basic page. The proof is kept whenever that
 * setting says it has arrived.
 */
export function readPalletwaysDetails(html: string, timezone: string, dueBy: string): PalletwaysDetails | null {
  const base = readPalletwaysStatus(html, timezone, dueBy)
  if (!base.stage) return null

  const events: TrackingEvent[] = []
  let receivedBy: string | null = null
  let receivedAt: Date | null = null
  let photo: PalletwaysProofImage | null = null
  let deliveryNote: PalletwaysProofImage | null = null

  for (const row of noteRows(html)) {
    const at = noteAt(row.date, row.time)
    const file = podFile(row.commentsHtml)
    const comments = file ? '' : textOf(row.commentsHtml)

    if (file && /pod_photo/i.test(file)) {
      // Several photographs come numbered; the first one listed is kept.
      photo ??= { url: palletwaysPodImageUrl(file), label: 'delivery-photo' }
    } else if (file) {
      deliveryNote ??= { url: palletwaysPodImageUrl(file), label: 'delivery-note' }
    }

    // The receipt row. The name is the part before " @ HH:MM".
    if (/\bPOD$/i.test(row.type) && comments && receivedBy === null) {
      const name = comments.split(/\s+@\s+/)[0]?.trim() ?? ''
      if (name) {
        receivedBy = name
        receivedAt = at ? courierInstant(at, timezone) : null
      }
    }

    if (!at) continue
    events.push({ at, location: '', text: comments ? `${row.type}: ${comments}` : row.type })
  }

  // Their own window for the drop, once the delivering depot has planned the
  // round, which says far more than the service's "by 17:00".
  const eta = latestPalletwaysEta(html)
  const due = parsePalletwaysStatus(html)?.dueDate ?? null
  const etaFrom = eta && (!due || eta.date >= due) ? courierInstant(`${eta.date}T${eta.from}:00`, timezone) : null
  const etaTo = eta && etaFrom ? courierInstant(`${eta.date}T${eta.to}:00`, timezone) : null
  const window = etaFrom && etaTo ? { windowFrom: etaFrom, windowTo: etaTo } : {}

  return { ...base, ...window, events, receivedBy, receivedAt, photo, deliveryNote }
}

/**
 * The newest "ETA" note: "Estimated Delivery Time: 09:24 on 12/11/2026Delivery
 * Window: 08:24 - 10:24" (no space before "Delivery", as served). The depot
 * texts the customer the same thing; it comes in on the morning of delivery,
 * and again if the round is replanned, newest first like every other note.
 *
 * Only the newest is read, and the caller ignores it when it is for an earlier
 * day than the one now due: that is the plan for an attempt that did not
 * happen, still sitting in the history.
 */
export function latestPalletwaysEta(html: string): { date: string; time: string; from: string; to: string } | null {
  for (const row of noteRows(html)) {
    if (!/^ETA$/i.test(row.type)) continue
    const m = /Estimated Delivery Time:\s*(\d{2}:\d{2})\s+on\s+(\d{1,2}\/\d{1,2}\/\d{4})\s*Delivery Window:\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/i
      .exec(textOf(row.commentsHtml))
    if (!m) return null
    const [, time = '', day = '', from = '', to = ''] = m
    const date = parsePalletwaysDate(day)
    if (!date || ![time, from, to].every((t) => HHMM.test(t)) || from >= to) return null
    return { date, time, from, to }
  }
  return null
}
