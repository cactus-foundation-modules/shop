import { z } from 'zod'
import { calendarDateIn } from '@/lib/config/timezone'
import { formatDeliveryDay, isDeliveryDate, slotTimeFromInstant } from '@/modules/shop/lib/delivery-slot'
import { courierInstant } from '@/modules/shop/lib/tracking/courier-clock'
import { fieldlyCode } from '@/modules/shop/lib/tracking/fieldly-link'
import { EMPTY_READING, type TrackingEvent, type TrackingReading } from '@/modules/shop/lib/tracking/reading'

// Reading a Fieldly parcel.
//
// Fieldly (fieldly.lt-innovations.co.uk) is the round-planning system some
// two-man couriers run on - Jewell Enterprises, for one. Their tracking page
// (/track/<code>) draws itself from one JSON feed, and that is what this reads:
//
//   GET https://fieldly.lt-innovations.co.uk/api/public/tracking/<code>
//
// No login, no session, no Referer gate. An unknown code is a 404 with
// {"error":"Tracking code not found"}. Captured 10 October 2026 from two
// Deskwell parcels, one delivered and one loaded for Monday.
//
// WHAT IT GIVES, AND WHERE IT GOES
//
// - current_status / status_label: 'loaded' / 'Loaded'. The label is the
//   stage, in their words, and the shop's settings say what it means - except
//   'delivered', which is their own flag and decides outright.
// - order_details.plannedDate / plannedWindow: '2026-10-12' and '2-4pm' (or
//   '10am-12pm'). The day is booked days ahead and the window added the day
//   before. A day with no window yet is passed on as the whole day, which the
//   booking reads as "the day, no time" - see isWholeDayWindow.
// - timeline: their history, newest first, each with a real UTC instant.
// - route_position / route_total / is_next: "Stop 4 of 12", on the day.
// - proof: receiverName, deliveredAt, signatureUrl, photos. Captured empty on a
//   delivered parcel, so all of it is optional.
//
// They give no van position, so there is no map. Their payload's customer and
// address fields held the order number on both captures, and nothing here
// reads them.

const BASE = 'https://fieldly.lt-innovations.co.uk/api/public/tracking'

/** Per request. Short enough that a hung server cannot hold a run open. */
const TIMEOUT_MS = 8000

/** Floor between two requests for the same parcel, however many people are
 *  watching it. */
export const FIELDLY_CACHE_MS = 30_000

/** Parcels remembered at once. */
const MAX_ENTRIES = 500

const FieldlyPayload = z.object({
  tracking_code: z.string().nullish(),
  current_status: z.string().nullish(),
  status_label: z.string().nullish(),
  order_details: z.object({
    plannedDate: z.string().nullish(),
    plannedWindow: z.string().nullish(),
  }).nullish(),
  timeline: z.array(z.object({
    label: z.string().nullish(),
    detail: z.string().nullish(),
    occurredAt: z.string().nullish(),
  })).nullish(),
  proof: z.object({
    deliveredAt: z.string().nullish(),
    receiverName: z.string().nullish(),
    signatureUrl: z.string().nullish(),
    photos: z.array(z.unknown()).nullish(),
    failureReason: z.string().nullish(),
  }).nullish(),
  route_position: z.number().int().nullish(),
  route_total: z.number().int().nullish(),
  is_next: z.boolean().nullish(),
})

export type FieldlyReading = TrackingReading & {
  /** Their signature or delivery photo, to be copied in once delivered. */
  proofImageUrl: string | null
  proofImageLabel: 'delivery-signature' | 'delivery-photo'
  /** 0 when they say "you are next", else null - they give no count. */
  dropsAway: number | null
}

/** Their window text as two 'HH:MM's: '2-4pm', '10am-12pm', '9:30-11.30am'.
 *  Null for anything else, rather than a guess. */
export function parseFieldlyWindow(text: string | null | undefined): { start: string; end: string } | null {
  const m = /^\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\s*$/i
    .exec(text ?? '')
  if (!m) return null
  const toMinutes = (hour: number, minute: number, meridiem: string): number | null => {
    if (hour < 1 || hour > 12 || minute > 59) return null
    return ((hour % 12) + (meridiem === 'pm' ? 12 : 0)) * 60 + minute
  }
  const endMeridiem = (m[6] as string).toLowerCase()
  const end = toMinutes(Number(m[4]), Number(m[5] ?? '0'), endMeridiem)
  if (end === null) return null
  let start: number | null
  if (m[3]) {
    start = toMinutes(Number(m[1]), Number(m[2] ?? '0'), m[3].toLowerCase())
  } else {
    // '2-4pm' shares the pm; '11-1pm' cannot, so the start is the morning.
    start = toMinutes(Number(m[1]), Number(m[2] ?? '0'), endMeridiem)
    if (start !== null && start >= end) start = toMinutes(Number(m[1]), Number(m[2] ?? '0'), 'am')
  }
  if (start === null || start >= end) return null
  const hhmm = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  return { start: hhmm(start), end: hhmm(end) }
}

/** A real instant out of one of their ISO strings. */
function instant(value: string | null | undefined): Date | null {
  if (!value) return null
  const at = new Date(value)
  return Number.isFinite(at.getTime()) ? at : null
}

/** An https address and nothing else - it is about to be fetched by the site's
 *  own server. */
function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null
  } catch {
    return null
  }
}

/** One line of their history, as the customer's page shows it. Their detail
 *  repeats the label word for word on most status changes ("Delivery Process
 *  updated to Loaded.") or is filler, and says nothing the label does not. */
function eventText(label: string, detail: string): string {
  const filler = /^delivery process updated to /i.test(detail)
    || /^your delivery details will appear here/i.test(detail)
  if (!detail || filler || detail === label) return label
  // Their own page writes '2026-09-30' as a day; so does this.
  const words = detail.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (date) => (isDeliveryDate(date) ? formatDeliveryDay(date) : date))
  return `${label} - ${words}`
}

/**
 * One payload of theirs, in the reading's terms. Pure.
 *
 * Null for a payload that is not a parcel - an error object, an unexpected
 * shape - which every caller reads as "learned nothing this time".
 */
export function readFieldlyPayload(raw: unknown, timezone: string): FieldlyReading | null {
  const parsed = FieldlyPayload.safeParse(raw)
  if (!parsed.success) return null
  const data = parsed.data
  const status = (data.current_status ?? '').trim().toLowerCase()
  const label = (data.status_label ?? '').trim()
  if (!label) return null
  const delivered = status === 'delivered'

  const events: TrackingEvent[] = []
  for (const row of data.timeline ?? []) {
    const at = instant(row.occurredAt)
    const rowLabel = (row.label ?? '').trim()
    if (!at || !rowLabel) continue
    const text = eventText(rowLabel, (row.detail ?? '').trim())
    // Their wall clock in the site's timezone - see TrackingEvent.
    const wall = `${calendarDateIn(at, timezone)}T${slotTimeFromInstant(at, timezone)}:00`
    // Two rows for one change at one moment ("Delivered", "Delivered") say it once.
    if (events.some((e) => e.at === wall && e.text === text)) continue
    events.push({ at: wall, location: '', text })
  }
  events.sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? 1 : -1))

  // The booked day, and the window on it once they have set one. A day alone
  // is sent as the whole day, which reads everywhere as "the day, no time".
  const plannedDate = (data.order_details?.plannedDate ?? '').trim()
  const window = parseFieldlyWindow(data.order_details?.plannedWindow)
  const windowFrom = isDeliveryDate(plannedDate)
    ? courierInstant(`${plannedDate}T${window?.start ?? '00:00'}:00`, timezone)
    : null
  const windowTo = isDeliveryDate(plannedDate)
    ? courierInstant(`${plannedDate}T${window?.end ?? '23:59'}:00`, timezone)
    : null

  const reason = (data.proof?.failureReason ?? '').trim()
  const stage = !delivered && reason ? `${label} - ${reason}` : label

  const onRound = !delivered
  const signature = delivered ? httpsUrl(data.proof?.signatureUrl) : null
  const photo = delivered ? (data.proof?.photos ?? []).map(httpsUrl).find((u) => u !== null) ?? null : null
  const receivedBy = delivered ? (data.proof?.receiverName ?? '').trim().slice(0, 120) || null : null

  return {
    ...EMPTY_READING,
    stage,
    events,
    windowFrom,
    windowTo,
    stopNumber: onRound ? data.route_position ?? null : null,
    stopsTotal: onRound ? data.route_total ?? null : null,
    // Their own flag where it says delivered; otherwise their words are read
    // against the shop's settings, which is all a status they never named can be.
    delivered: delivered ? true : null,
    outForDelivery: null,
    receivedBy,
    receivedAt: delivered ? instant(data.proof?.deliveredAt) : null,
    proofImageUrl: signature ?? photo,
    proofImageLabel: signature ? 'delivery-signature' : 'delivery-photo',
    dropsAway: onRound && data.is_next ? 0 : null,
  }
}

/** The address their own page asks, for one link. Null for anything that is
 *  not a Fieldly link, so no other URL can turn into a request from here. */
export function fieldlyFeedUrl(trackingUrl: string | null | undefined): string | null {
  const code = fieldlyCode(trackingUrl)
  return code ? `${BASE}/${encodeURIComponent(code)}` : null
}

async function fetchOnce(url: string): Promise<{ ok: true; body: unknown } | { ok: false; notFound: boolean }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { accept: 'application/json', 'user-agent': 'CactusShopDeliveryTracking/1.0 (+order status)' },
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, notFound: res.status === 404 }
    return { ok: true, body: await res.json() }
  } catch {
    // A timeout, a DNS failure, a courier having an afternoon. Silence is not
    // evidence of anything, and least of all of a parcel not having arrived.
    return { ok: false, notFound: false }
  } finally {
    clearTimeout(timer)
  }
}

type Cached = { at: number; value: FieldlyReading | null }
const entries = new Map<string, Cached>()
const inFlight = new Map<string, Promise<FieldlyReading | null>>()

/**
 * One look at one Fieldly parcel, shared by everyone asking within
 * FIELDLY_CACHE_MS. One quiet retry, except on a 404, which is an answer.
 * Null means nothing was learned.
 */
export async function readFieldly(
  trackingUrl: string | null | undefined,
  timezone: string,
  now: number = Date.now(),
): Promise<FieldlyReading | null> {
  const url = fieldlyFeedUrl(trackingUrl)
  if (!url) return null
  const key = `${url}|${timezone}`

  const cached = entries.get(key)
  if (cached && now - cached.at < FIELDLY_CACHE_MS) return cached.value
  const existing = inFlight.get(key)
  if (existing) return existing

  const request = (async () => {
    let result = await fetchOnce(url)
    if (!result.ok && !result.notFound) {
      await new Promise((resolve) => setTimeout(resolve, 750))
      result = await fetchOnce(url)
    }
    return result.ok ? readFieldlyPayload(result.body, timezone) : null
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
export function resetFieldlyCache(): void {
  entries.clear()
  inFlight.clear()
}
