import { instantAtWallClock } from '@/lib/config/timezone'
import { textOf } from '@/modules/shop/lib/tracking/html-text'

// The rest of a Multidrop tracking page: the config block their own map script
// reads, the sentence they print above the map, and the signature card that
// appears once the parcel has arrived. The seven timeline steps are multidrop.ts.
//
// All of it comes out of the same HTML the stage poller already fetches, so
// none of this costs a second request.
//
// WHAT IS TRUSTED HERE, AND WHAT IS NOT
//
// The config block is the courier's own machine-readable corner of the page and
// is read as written. The crew sentence is not: it is prose, it is theirs to
// reword, and on the first delivery this was built against their sentence
// ("1 more drop to make") and their own drop numbers (17 of 17) flatly
// contradicted each other. So the sentence is what a customer is shown, and the
// number behind it is only ever read back OUT of that sentence - never from the
// numeric fields, which would produce a confident, wrong answer.

export type MultidropPageConfig = {
  /** Ids their map endpoint needs. The route is the day's ROUND, not this
   *  parcel: it changes daily, so it is re-read rather than remembered. */
  clientId: string | null
  routeId: string | null
  /** Their own status code - 'AR' out with the crew, 'SD' signed for. Recorded
   *  for the admin screen; nothing is decided from it, because what a code means
   *  is exactly the sort of thing that is theirs to change. */
  status: string | null
  /** Where their van is heading. Their pin for this drop, in their digits - the
   *  point of taking it from here rather than geocoding our own address is that
   *  a map should show what the crew was actually given. */
  destinationLat: string | null
  destinationLng: string | null
}

export type MultidropSignature = {
  /** As the courier printed it, their spelling. */
  signedBy: string | null
  /** When THEY said it was signed, in the site's timezone. Not when we noticed. */
  signedAt: Date | null
  /** Their copy of the image. Absolute https or nothing - this becomes a fetch. */
  imageUrl: string | null
}

// `var trackingConfig = { ... };` - matched non-greedily to the first `};` so a
// later script on the page cannot extend it.
const CONFIG_BLOCK = /var\s+trackingConfig\s*=\s*\{([\s\S]*?)\}\s*;/i
const ETA_STATUS = /<div\s+id="eta-status"[^>]*>([\s\S]*?)<\/div>/i
const SIGNATURE_BLOCK = /<div\s+class="signature-block-container"[\s\S]{0,2000}?<img[^>]*\ssrc="([^"]+)"/i
const SIGNED_BY = /Signed\s+by\s*<strong>([\s\S]{0,200}?)<\/strong>/i

// Their timestamps, everywhere they appear: 08/09/2026 14:23, sometimes with
// seconds. Day first - this is a British courier, and reading it the American
// way turns the 8th of September into the 9th of August without complaining.
const COURIER_TIMESTAMP = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/

// How many drops are left, out of their own sentence and nothing else. A
// wording this does not recognise gives null, which every caller reads as "not
// known" - never as "you are next".
const DROPS_AWAY = /(\d+)\s+more\s+drops?\b/i

// A latitude or longitude and nothing else. These end up in a database column,
// in JSON on a public route and finally in a map script's hands, so they are
// checked at the point they are read rather than anywhere further along.
const COORDINATE = /^-?\d{1,3}(\.\d{1,10})?$/

function coordinate(value: string | null, limit: number): string | null {
  if (!value || !COORDINATE.test(value)) return null
  return Math.abs(Number(value)) <= limit ? value : null
}

/** One `key: "value"` out of the config block. */
function configValue(body: string, key: string): string | null {
  const match = body.match(new RegExp(`(?:^|[,{\\s])${key}\\s*:\\s*"([^"]*)"`, 'i'))
  const value = match?.[1]?.trim()
  return value ? value : null
}

export function parseTrackingConfig(html: string): MultidropPageConfig {
  const body = html.match(CONFIG_BLOCK)?.[1]
  if (!body) return { clientId: null, routeId: null, status: null, destinationLat: null, destinationLng: null }
  return {
    clientId: configValue(body, 'clientID'),
    routeId: configValue(body, 'routeID'),
    status: configValue(body, 'status'),
    destinationLat: coordinate(configValue(body, 'userLat'), 90),
    destinationLng: coordinate(configValue(body, 'userLng'), 180),
  }
}

/**
 * A `DD/MM/YYYY HH:MM[:SS]` of theirs as an instant, read in the site's
 * timezone.
 *
 * Never `new Date(text)`: that reads their day-first dates as month-first, so
 * 08/09/2026 becomes the 9th of August, and where the day is above twelve it
 * gives an Invalid Date instead. Both are worse than nothing.
 */
export function parseCourierTimestamp(text: string | null | undefined, timezone: string): Date | null {
  const match = (text ?? '').match(COURIER_TIMESTAMP)
  if (!match) return null

  const [, dd, mm, yyyy, hh, min, ss] = match
  const day = Number(dd)
  const month = Number(mm)
  if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return null

  const date = `${yyyy}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const at = instantAtWallClock(date, `${String(Number(hh ?? 0)).padStart(2, '0')}:${min ?? '00'}`, timezone)
  // Seconds are added afterwards because a wall-clock helper the whole site
  // shares speaks in HH:MM - and a fix's seconds are the difference between
  // "reported 12 seconds ago" and a number that jumps a minute at a time.
  const seconds = Number(ss ?? 0)
  return Number.isFinite(at.getTime()) ? new Date(at.getTime() + seconds * 1000) : null
}

/** Their sentence above the map, as they wrote it. Null when the page has no
 *  crew panel at all, which is every page before the round starts and every
 *  page after it has been signed for. */
export function parseCrewLine(html: string): string | null {
  const line = textOf(html.match(ETA_STATUS)?.[1] ?? '')
  return line || null
}

/** Drops left before ours, read out of their sentence. Null for any wording
 *  this does not recognise. */
export function dropsAwayFromCrewLine(line: string | null | undefined): number | null {
  const found = (line ?? '').match(DROPS_AWAY)?.[1]
  if (found === undefined) return null
  const drops = Number(found)
  return Number.isInteger(drops) && drops >= 0 && drops < 1000 ? drops : null
}

/**
 * The signature card, once the parcel has been signed for.
 *
 * Null until it appears. A page with the card but no readable name still
 * returns a record - the image is the proof, and a courier who signs a delivery
 * "-" has still delivered it.
 */
export function parseSignature(html: string, timezone: string): MultidropSignature | null {
  const rawImage = html.match(SIGNATURE_BLOCK)?.[1]?.trim()
  const strong = html.match(SIGNED_BY)?.[1]
  if (!rawImage && !strong) return null

  let imageUrl: string | null = null
  if (rawImage) {
    try {
      // https only, and no credentials smuggled into the authority - this URL
      // is about to be fetched by the site's own server.
      const url = new URL(rawImage)
      if (url.protocol === 'https:' && !url.username && !url.password) imageUrl = url.toString()
    } catch {
      imageUrl = null
    }
  }

  // 'Megan, 08/09/2026 14:23' - the name is whatever precedes the timestamp,
  // with the comma that joined them taken off. Split on the timestamp rather
  // than on the last comma, because a name can carry one of its own
  // ('Megan, Reception') and the date never moves.
  const printed = textOf(strong ?? '')
  const stamp = printed.match(COURIER_TIMESTAMP)
  const name = (stamp?.index !== undefined ? printed.slice(0, stamp.index) : printed)
    .replace(/[,\s]+$/, '')
    .trim()

  return {
    signedBy: name || null,
    signedAt: parseCourierTimestamp(printed, timezone),
    imageUrl,
  }
}
