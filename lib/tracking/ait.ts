import { z } from 'zod'
import { aitLinkParts, type AitLink } from '@/modules/shop/lib/tracking/ait-link'
import { AIT_STAGE, AIT_STAGE_MEANING } from '@/modules/shop/lib/tracking/ait-stages'
import { EMPTY_READING, type TrackingEvent, type TrackingReading } from '@/modules/shop/lib/tracking/reading'

// Reading an AIT Home Delivery parcel.
//
// AIT's tracking page (aithd.com/<code>) is a script that draws itself from one
// JSON feed, and that feed is what this reads - the same single request their
// own page makes, nothing it does not:
//
//   GET https://public-api.uk.aithomedelivery.com/apiv2/anon/tracking/details?key=<code>
//
// No login and no session. The one thing it insists on is a Referer from their
// own tracking site: without it the answer is a 403, with it the full parcel.
// Captured 9 October 2026 from a Deskwell parcel that was out for delivery,
// drop 21 of 21.
//
// WHAT IT GIVES, AND WHERE IT GOES
//
// - orderStatusID: their status code. OD is out for delivery, D and CO
//   delivered, UD and NC unsuccessful. The codes decide delivered and out for
//   delivery outright - a code from the carrier is better evidence than a
//   sentence matched against a setting - and are turned into the fixed words
//   in ait-stages.ts, whose meanings the shop knows without any setting.
// - orderTimeFrom / orderTimeTo: the two-hour window, as real epoch
//   milliseconds. Checked against their own wall-clock strings: 11:27 BST is
//   10:27 UTC, so no timezone is applied to them here.
// - dropCurrent / dropYourOrder / dropTotal: their page says "driver on drop 5,
//   your order is drop 21/21", and calls you a few drops away when
//   dropYourOrder - dropCurrent is small. That same subtraction is the drops
//   away here, so our page and theirs never disagree about it.
// - driverLatitude / driverLongditude (sic): the crew's position. It carries NO
//   time of its own and no heading, so the shop records when it asked instead
//   and says "Checked" rather than "Updated" - see positionFreshness.
// - routeDriver: the driver's first name, lower-case as they keep it.
// - trackingDetails: the history, oldest first, with no location column.
// - customerSignature: "N/A" until delivery. Their page prints it under
//   "Signed for by". Once delivered it becomes the signature image's address,
//   which is copied in like Multidrop's; a value that is not an address is
//   kept as the name it then must be.
//
// The reply also carries the customer's phone number, the driver's phone
// number and the address's coordinates. Nothing here passes the first two on,
// and the payload itself is never stored or sent to a browser.

const API_BASE: Record<AitLink['region'], string> = {
  com: 'https://public-api.uk.aithomedelivery.com/apiv2',
  de: 'https://public-api.de.aithomedelivery.com/apiv2',
}

/** Per request. Short enough that a hung server cannot hold a run open. */
const TIMEOUT_MS = 8000

/** Floor between two requests for the same parcel, however many people are
 *  watching it. The live map asks once a minute per viewer at its fastest; an
 *  office with four tabs open should still cost AIT one request. */
export const AIT_CACHE_MS = 30_000

/** Parcels remembered at once. Well past a busy shop's simultaneous deliveries. */
const MAX_ENTRIES = 500

const coordinateLike = z.union([z.string(), z.number()]).nullish()

/** Their reply, in their shapes, and only the fields this uses. Lenient about
 *  types where they have been loose before (coordinates are strings for the
 *  driver and numbers for the drop in the same payload). */
const AitPayload = z.object({
  trackingId: z.string().nullish(),
  orderStatusID: z.string().nullish(),
  orderClientID: z.union([z.string(), z.number()]).nullish(),
  orderTimeFrom: z.union([z.string(), z.number()]).nullish(),
  orderTimeTo: z.union([z.string(), z.number()]).nullish(),
  dropCurrent: z.number().int().nullish(),
  dropYourOrder: z.number().int().nullish(),
  dropTotal: z.number().int().nullish(),
  isRegularDrop: z.boolean().nullish(),
  dropLatitude: coordinateLike,
  dropLongditude: coordinateLike,
  driverLatitude: coordinateLike,
  driverLongditude: coordinateLike,
  routeDriver: z.string().nullish(),
  routeName: z.string().nullish(),
  customerSignature: z.string().nullish(),
  failureCodeReason: z.string().nullish(),
  trackingDetails: z.array(z.object({
    historyDateTimeStamp: z.number().nullish(),
    historyDateTime: z.string().nullish(),
    historyStatus: z.string().nullish(),
    historyDetails: z.string().nullish(),
  })).nullish(),
})

export type AitPayload = z.infer<typeof AitPayload>

/** Their status codes, in the words their own page uses for them. A code not
 *  listed here falls back to the newest line of their history, which is their
 *  own words too, rather than to an invention. */
const STAGE_WORDS: Record<string, string> = {
  O: AIT_STAGE.ordered,
  B: AIT_STAGE.booked,
  BR: AIT_STAGE.booked,
  OD: AIT_STAGE.outForDelivery,
  D: AIT_STAGE.delivered,
  CO: AIT_STAGE.delivered,
  UD: AIT_STAGE.unsuccessful,
  NC: AIT_STAGE.unsuccessful,
  P: AIT_STAGE.partial,
  PD: AIT_STAGE.partial,
  C: AIT_STAGE.cancelled,
  RTS: AIT_STAGE.cancelled,
  H: AIT_STAGE.onHold,
  SOC: AIT_STAGE.shipped,
}

const DELIVERED = new Set(['D', 'CO'])
const UNSUCCESSFUL = new Set(['UD', 'NC'])

/** A latitude or longitude and nothing else. These end up in a database
 *  column, in JSON on a public route and finally in a map script's hands. */
const COORDINATE = /^-?\d{1,3}(\.\d{1,10})?$/

function coordinate(value: string | number | null | undefined, limit: number): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (!COORDINATE.test(text)) return null
  const asNumber = Number(text)
  // 0,0 is the Atlantic, which is where a feed puts a van it has no fix for.
  if (asNumber === 0) return null
  return Math.abs(asNumber) <= limit ? text : null
}

/** Epoch milliseconds, as a string or a number, into an instant. */
function instant(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const ms = Number(value)
  if (!Number.isFinite(ms) || ms <= 0) return null
  const at = new Date(ms)
  return Number.isFinite(at.getTime()) ? at : null
}

/** 'YYYY-MM-DD HH:MM:SS' of theirs as the reading's 'YYYY-MM-DDTHH:MM:SS'.
 *  Their wall clock, deliberately not converted - see TrackingEvent. */
function eventTime(value: string | null | undefined): string | null {
  const m = (value ?? '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  return `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? '00'}`
}

/** An https address and nothing else - this is about to be fetched by the
 *  site's own server, so no other scheme and no credentials in the authority. */
function httpsUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null
  } catch {
    return null
  }
}

/** What their signature field holds once it holds something: the image's
 *  address, or failing that a name. "N/A" and blank are both "not yet". */
export function aitSignature(value: string | null | undefined): { imageUrl: string | null; name: string | null } {
  const text = (value ?? '').trim()
  if (!text || /^n\/?a$/i.test(text)) return { imageUrl: null, name: null }
  if (/^https?:\/\//i.test(text)) return { imageUrl: httpsUrl(text), name: null }
  // Never a data: URI or a path pretending to be a name.
  if (/^data:|[/\\<>]/i.test(text) || text.length > 120) return { imageUrl: null, name: null }
  return { imageUrl: null, name: text }
}

/** The driver's first name only, with a capital, however they keep it. */
function firstName(value: string | null | undefined): string | null {
  const first = (value ?? '').trim().split(/\s+/)[0] ?? ''
  if (!first || !/^[\p{L}'-]{1,40}$/u.test(first)) return null
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

export type AitReading = TrackingReading & {
  /** Where the crew is, with no time of its own. */
  vehicle: { lat: string; lng: string } | null
  destinationLat: string | null
  destinationLng: string | null
  /** Drops left before this one, by their own subtraction. */
  dropsAway: number | null
  /** Their signature image, to be copied in once the parcel is delivered. */
  signatureImageUrl: string | null
  /** Their client number for the shop, and the day's round name. Shown on the
   *  admin screen; nothing is decided from either. */
  clientId: string | null
  routeId: string | null
}

/**
 * One payload of theirs, in the reading's terms. Pure.
 *
 * Stage is null for a payload that is not a parcel at all - an error object, a
 * page of HTML parsed as JSON by accident - which every caller reads as
 * "learned nothing this time", never as "not delivered".
 */
export function readAitPayload(raw: unknown): AitReading | null {
  const parsed = AitPayload.safeParse(raw)
  if (!parsed.success) return null
  const data = parsed.data
  const code = (data.orderStatusID ?? '').trim().toUpperCase()

  // Newest first, as every courier's own page shows it.
  // They send it oldest first, and two lines often share a second ("loaded"
  // then "out for delivery"), so a tie keeps their order rather than the sort's.
  const events: TrackingEvent[] = (data.trackingDetails ?? [])
    .map((row, index) => {
      const at = eventTime(row.historyDateTime)
      const status = (row.historyStatus ?? '').trim()
      const details = (row.historyDetails ?? '').trim()
      if (!at || !status) return null
      return { at, location: '', text: details ? `${status} - ${details}` : status, index }
    })
    .filter((row): row is TrackingEvent & { index: number } => row !== null)
    .sort((a, b) => (a.at === b.at ? b.index - a.index : a.at < b.at ? 1 : -1))
    .map(({ at, location, text }) => ({ at, location, text }))

  // A code this does not know falls back to their newest history line, in
  // their own words - unless those words happen to be one of the stages the
  // shop gives a meaning to, which would let a line of history say "delivered"
  // when the code did not.
  const fallback = events[0]?.text.split(' - ')[0] ?? null
  const fallbackClashes = fallback !== null && Object.hasOwn(AIT_STAGE_MEANING, fallback.trim().toLowerCase())
  const words = STAGE_WORDS[code] ?? (fallback && !fallbackClashes ? fallback : code ? `Status ${code}` : null)
  if (!words) return null

  // Their reason for an unsuccessful attempt rides on the stage, after " - ",
  // which is where failedReason looks for one and where Multidrop puts theirs.
  const reason = (data.failureCodeReason ?? '').trim()
  const stage = UNSUCCESSFUL.has(code) && reason ? `${words} - ${reason}` : words

  const delivered = code ? DELIVERED.has(code) : null
  const outForDelivery = code ? code === 'OD' : null

  // Only while the van is out on a normal round. Their page hides the drop
  // lines when isRegularDrop is false, and a finished parcel's numbers are
  // yesterday's news.
  const onRound = code === 'OD' && data.isRegularDrop !== false
  const yours = onRound ? data.dropYourOrder ?? null : null
  const current = onRound ? data.dropCurrent ?? null : null
  const total = onRound ? data.dropTotal ?? null : null
  const dropsAway = yours !== null && current !== null && yours > 0 && current >= 0
    ? Math.max(0, yours - current)
    : null

  const lat = code === 'OD' ? coordinate(data.driverLatitude, 90) : null
  const lng = code === 'OD' ? coordinate(data.driverLongditude, 180) : null

  // Only once it is delivered. Before that the field is "N/A", and on a failed,
  // partial or cancelled parcel a name in it would be filed as "signed for" -
  // which the customer's page reads as arrived, over the top of the failure.
  const signature = DELIVERED.has(code)
    ? aitSignature(data.customerSignature)
    : { imageUrl: null, name: null }

  return {
    ...EMPTY_READING,
    stage,
    events,
    windowFrom: instant(data.orderTimeFrom),
    windowTo: instant(data.orderTimeTo),
    stopNumber: yours,
    // Their page counts the drop the driver is ON, and so does this - the
    // live line's "N more drops before yours" is then their own subtraction.
    stopsCompleted: current,
    stopsTotal: total,
    driverName: firstName(data.routeDriver),
    delivered,
    outForDelivery,
    receivedBy: signature.name,
    // When it was finished, by their own clock: the newest line of history.
    receivedAt: DELIVERED.has(code) ? instantOfNewest(data.trackingDetails) : null,
    vehicle: lat && lng ? { lat, lng } : null,
    destinationLat: coordinate(data.dropLatitude, 90),
    destinationLng: coordinate(data.dropLongditude, 180),
    dropsAway,
    signatureImageUrl: signature.imageUrl,
    clientId: data.orderClientID === null || data.orderClientID === undefined ? null : String(data.orderClientID),
    routeId: data.routeName?.trim() || null,
  }
}

function instantOfNewest(rows: AitPayload['trackingDetails']): Date | null {
  const stamps = (rows ?? []).map((r) => r.historyDateTimeStamp ?? 0).filter((n) => n > 0)
  return stamps.length ? instant(Math.max(...stamps)) : null
}

/** The address their own page asks, for one link. Null for anything that is
 *  not an AIT short link, so no other URL can turn into a request from here. */
export function aitDetailsUrl(trackingUrl: string | null | undefined): string | null {
  const parts = aitLinkParts(trackingUrl)
  if (!parts) return null
  return `${API_BASE[parts.region]}/anon/tracking/details?key=${encodeURIComponent(parts.code)}`
}

/** The headers their feed answers to. The Referer is the gate - their API
 *  refuses a request that does not come from their own tracking page. */
export function aitRequestHeaders(region: AitLink['region']): Record<string, string> {
  return {
    accept: 'application/json',
    referer: `https://aithd.${region}/`,
    origin: `https://aithd.${region}`,
  }
}

/** For fetching their signature image: the Referer alone, since an image
 *  request that insists on JSON would be refused by anything strict. */
export function aitImageHeaders(region: AitLink['region']): Record<string, string> {
  return { referer: `https://aithd.${region}/` }
}

async function fetchOnce(url: string, region: AitLink['region']): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: aitRequestHeaders(region),
      cache: 'no-store',
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    // A timeout, a DNS failure, Cloudflare having an afternoon. Silence is not
    // evidence of anything, and least of all of a parcel not having arrived.
    return null
  } finally {
    clearTimeout(timer)
  }
}

type Cached = { at: number; value: AitReading | null }
const entries = new Map<string, Cached>()
const inFlight = new Map<string, Promise<AitReading | null>>()

/**
 * One look at one AIT parcel, shared by everyone asking within AIT_CACHE_MS.
 *
 * One quiet retry: their edge has answered a 503 to a request that worked a
 * second later. Null means nothing was learned.
 */
export async function readAit(trackingUrl: string | null | undefined, now: number = Date.now()): Promise<AitReading | null> {
  const parts = aitLinkParts(trackingUrl)
  const url = aitDetailsUrl(trackingUrl)
  if (!parts || !url) return null
  const key = `${parts.region}:${parts.code}`

  const cached = entries.get(key)
  if (cached && now - cached.at < AIT_CACHE_MS) return cached.value
  const existing = inFlight.get(key)
  if (existing) return existing

  const request = (async () => {
    let raw = await fetchOnce(url, parts.region)
    if (raw === null) {
      await new Promise((resolve) => setTimeout(resolve, 750))
      raw = await fetchOnce(url, parts.region)
    }
    return raw === null ? null : readAitPayload(raw)
  })()
    .then((value) => {
      while (entries.size >= MAX_ENTRIES) {
        const oldest = entries.keys().next()
        if (oldest.done) break
        entries.delete(oldest.value)
      }
      entries.delete(key)
      entries.set(key, { at: now, value })
      return value
    })
    .catch(() => null)
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, request)
  return request
}

/** Test seam. The cache is process-local and dies with the instance. */
export function resetAitCache(): void {
  entries.clear()
  inFlight.clear()
}
