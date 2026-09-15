// Reading DPD's own tracking, and the two very different amounts of it they
// will tell you.
//
// ANONYMOUS: their public feed answers to anybody holding the parcel code, and
// gives fifteen fields - a status sentence, and the event history behind the
// "Where has my parcel been?" table. Enough for a timeline and for the driver's
// first name and the one-hour slot, which they mark up inside the sentence.
//
// WITH A FOLLOW-MY-PARCEL CODE: the tail of the www.dpd.co.uk/d/<code> link
// they email is a SESSION KEY. Exchanged for a cookie it turns the same
// endpoint into about ninety fields, including the round this parcel is on, its
// stop number, how many stops the driver has done and how many minutes away
// they are. That code cannot be derived - their session endpoint refuses the
// parcel code, the parcel number and the consignment number alike - so a parcel
// without one reads anonymously and says less. It is never an error.
//
// Everything here is pure: given text, it returns a reading. The fetching, the
// cookie and the order of the calls live in dpd-session.ts, so this file can be
// tested against a captured payload and never over a network.

import { z } from 'zod'
import { courierInstant } from '@/modules/shop/lib/tracking/courier-clock'
import { EMPTY_READING, type TrackingEvent, type TrackingReading } from '@/modules/shop/lib/tracking/reading'

/**
 * The parcel code out of a DPD tracking link.
 *
 * '15505217095248*21437' - digits, a star, more digits. The star is theirs and
 * is passed on untouched: it is a path segment to them, not a wildcard, and
 * encoding it turns a working link into a 404.
 */
export function dpdParcelCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = /track\.dpd\.co\.uk\/parcels\/(\d{8,20}(?:\*\d{1,10})?)/i.exec(url)
  return m?.[1] ?? null
}

/**
 * The session code out of a follow-my-parcel link.
 *
 * Accepts the bare code too, because an owner pasting from an email is as
 * likely to paste '6dPoGe7yvJAW' as the whole address, and refusing them on a
 * technicality would cost the parcel its live tracking for the sake of being
 * right about a URL.
 */
export function dpdShortCodeFromUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  const m = /dpd(?:local)?\.co\.uk\/d\/([A-Za-z0-9]{6,32})/i.exec(trimmed)
  if (m?.[1]) return m[1]
  return /^[A-Za-z0-9]{6,32}$/.test(trimmed) ? trimmed : null
}

// Their timestamps are 'YYYY-MM-DD HH:MM:SS' with no offset and no 'T'. Safari
// and Node disagree about whether that is even a date, so it is never handed to
// `new Date` as it stands.
function isoish(value: string | null | undefined): string | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim())
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}`
}

/** As an instant, reading their wall clock as the SITE's timezone - see
 *  courier-clock.ts. Their feed carries no offset, and building the instant on
 *  the server's own clock put a British delivery an hour into the future for
 *  seven months of the year. */
function asDate(value: string | null | undefined, timezone: string): Date | null {
  return courierInstant(isoish(value), timezone)
}

// Schemas are deliberately loose. This is somebody else's feed: a field that
// turns up as null on a parcel that has not moved, and as an object on one that
// has, is normal, and a reader that threw on it would stop tracking every
// parcel in the country the day DPD added a key. Unknown keys are dropped, the
// known ones are checked, and anything missing reads as "not told".
const stopSchema = z.object({
  deliveryWindowFrom: z.string().nullish(),
  deliveryWindowTo: z.string().nullish(),
  stopNumber: z.number().int().nullish(),
  estimatedMinsToStop: z.number().int().nullish(),
}).nullish()

export const dpdParcelSchema = z.object({
  data: z.object({
    parcelCode: z.string().nullish(),
    parcelNumber: z.string().nullish(),
    consignmentNumber: z.string().nullish(),
    trackingStatusCurrent: z.string().nullish(),
    parcelStatusHtml: z.string().nullish(),
    deliveredToConsumer: z.boolean().nullish(),
    outForDeliveryDetails: z.object({
      outForDelivery: z.boolean().nullish(),
    }).nullish(),
    image: z.array(z.object({
      key: z.string().nullish(),
      type: z.string().nullish(),
      caption: z.string().nullish(),
    })).nullish(),
    deliveryDetails: z.object({
      podDetails: z.object({
        podName: z.string().nullish(),
        podDate: z.string().nullish(),
      }).nullish(),
    }).nullish(),
    deliveryDepot: z.object({
      depotCode: z.string().nullish(),
      route: z.object({
        routeCode: z.string().nullish(),
        stop: stopSchema,
      }).nullish(),
    }).nullish(),
  }),
})

export const dpdEventsSchema = z.object({
  data: z.array(z.object({
    eventDate: z.string().nullish(),
    eventLocation: z.string().nullish(),
    eventText: z.string().nullish(),
  })),
})

export const dpdRouteSchema = z.object({
  data: z.object({
    routeCode: z.string().nullish(),
    depotCode: z.string().nullish(),
    driverCode: z.string().nullish(),
    driverDisplayName: z.string().nullish(),
    completedDeliveryStops: z.number().int().nullish(),
    totalDeliveryStops: z.number().int().nullish(),
  }),
})

export type DpdParcel = z.infer<typeof dpdParcelSchema>['data']
export type DpdRoute = z.infer<typeof dpdRouteSchema>['data']

/** Their driver endpoint wants depot and driver joined by a star. Neither field
 *  is called that, and asking with the bare driver code returns 403 - which
 *  reads like a permissions problem and is not one. */
export function dpdDriverId(depotCode: string | null | undefined, driverCode: string | null | undefined): string | null {
  const depot = depotCode?.trim()
  const driver = driverCode?.trim()
  return depot && driver ? `${depot}*${driver}` : null
}

/**
 * The driver's first name out of the status sentence.
 *
 * DPD mark it up themselves - "delivered today by <SPAN class="REDTEXT">Mozam
 * </SPAN>, your DPD driver" - and the first of those spans is the name. Read
 * from the markup rather than from the words around it, because the words are
 * marketing copy and change with the season while the span is structure.
 */
export function dpdDriverName(statusHtml: string | null | undefined): string | null {
  if (!statusHtml) return null
  const spans = [...statusHtml.matchAll(/<span[^>]*class="[^"]*REDTEXT[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)]
  for (const span of spans) {
    const text = (span[1] ?? '').replace(/<[^>]*>/g, '').trim()
    // The other span in that sentence is the time window, which starts with a
    // word rather than a digit only by accident of their copy - so a span
    // holding any digit is not a name.
    if (text && !/\d/.test(text) && text.length <= 40) return text
  }
  return null
}

/** The one-hour slot out of the same sentence, as 'HH:MM' pair, where DPD have
 *  committed to one. Used only when the session feed - which gives the window
 *  as proper instants - is not available. */
export function dpdStatusWindow(statusHtml: string | null | undefined): { start: string; end: string } | null {
  if (!statusHtml) return null
  const m = /between\s*(\d{1,2}:\d{2})\s*and\s*(\d{1,2}:\d{2})/i.exec(statusHtml.replace(/<[^>]*>/g, ''))
  if (!m) return null
  return { start: (m[1] as string).padStart(5, '0'), end: (m[2] as string).padStart(5, '0') }
}

/** Whether DPD's feed says this parcel has arrived.
 *
 * The shop's deliveredStages setting is intentionally blank for DPD because
 * their scan text changes on every parcel. That only works if the session feed
 * answers and `deliveredToConsumer` is read - and when session minting fails,
 * the anonymous feed still carries "Your parcel has been delivered" in the
 * events while the boolean is absent. Treating null as "not delivered" in that
 * case leaves a parcel stuck out for delivery for the rest of the hour. */
export function dpdFeedSaysDelivered(
  data: Pick<DpdParcel, 'deliveredToConsumer' | 'trackingStatusCurrent'> | null,
  events: TrackingEvent[],
): boolean | null {
  if (data?.deliveredToConsumer === true) return true
  if (data?.deliveredToConsumer === false) return false

  const status = (data?.trackingStatusCurrent ?? '').replace(/<[^>]*>/g, ' ').trim().toLowerCase()
  if (status.includes('has been delivered')) return true

  for (const event of events.slice(0, 3)) {
    const text = event.text.trim().toLowerCase()
    if (text.includes('has been delivered') || text.includes('received by')) return true
  }

  return null
}

/** Their history, newest first, in their words. */
export function dpdEvents(payload: unknown): TrackingEvent[] {
  const parsed = dpdEventsSchema.safeParse(payload)
  if (!parsed.success) return []
  const events: TrackingEvent[] = []
  for (const row of parsed.data.data) {
    const at = isoish(row.eventDate)
    const text = row.eventText?.trim()
    if (!at || !text) continue
    events.push({ at, location: row.eventLocation?.trim() ?? '', text })
  }
  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

/**
 * One reading, from whatever DPD were willing to say.
 *
 * The stage is the newest EVENT's text rather than the status sentence.
 * Deliberately: the sentence is written for a customer and mentions the
 * shipper, the driver and the timeslot, so no two parcels ever produce the same
 * string and no setting could ever match one. The event text is the scan.
 */
export function readDpd(input: {
  parcel: unknown
  events: unknown
  route?: unknown
  /** The site's timezone. Their clock readings mean nothing without it. */
  timezone: string
}): TrackingReading {
  const parcel = dpdParcelSchema.safeParse(input.parcel)
  const events = dpdEvents(input.events)
  const route = input.route ? dpdRouteSchema.safeParse(input.route) : null

  const data = parcel.success ? parcel.data.data : null
  const stop = data?.deliveryDepot?.route?.stop ?? null
  const routeData = route?.success ? route.data.data : null

  return {
    stage: events[0]?.text ?? null,
    events,
    windowFrom: asDate(stop?.deliveryWindowFrom, input.timezone),
    windowTo: asDate(stop?.deliveryWindowTo, input.timezone),
    stopNumber: stop?.stopNumber ?? null,
    stopsCompleted: routeData?.completedDeliveryStops ?? null,
    stopsTotal: routeData?.totalDeliveryStops ?? null,
    minutesToStop: stop?.estimatedMinsToStop ?? null,
    // Their own sentence first: it is what the customer would read on DPD's
    // page, and the route's display name has come back empty on a round whose
    // driver had not started.
    driverName: dpdDriverName(data?.parcelStatusHtml) ?? routeData?.driverDisplayName?.trim() ?? null,
    // Session boolean when they give one; otherwise the events and status
    // sentence, which the anonymous feed carries too once a parcel has landed.
    delivered: dpdFeedSaysDelivered(data, events),
    // Their flag, and the reason this reader does not try to match their
    // status sentence: "Your parcel will be with you today between 11:41 and
    // 12:41" is a different string on every parcel and on every delivery, so
    // no words an owner could type would ever match it.
    outForDelivery: data?.outForDeliveryDetails?.outForDelivery ?? null,
    // Their proof of delivery, in words. The photograph beside it is fetched
    // separately - see dpdImageHeaders and read-parcel.ts.
    receivedBy: data?.deliveryDetails?.podDetails?.podName?.trim() || null,
    receivedAt: asDate(data?.deliveryDetails?.podDetails?.podDate, input.timezone),
  }
}

/** The route this parcel is on today, if DPD have said. Null on every parcel
 *  that is not out with a driver, which is most of them most of the time. */
export function dpdRouteCode(parcel: unknown): string | null {
  const parsed = dpdParcelSchema.safeParse(parcel)
  return parsed.success ? parsed.data.data.deliveryDepot?.route?.routeCode?.trim() ?? null : null
}

/** The depot whose driver has it, for the id their driver endpoint wants. */
export function dpdDepotCode(parcel: unknown): string | null {
  const parsed = dpdParcelSchema.safeParse(parcel)
  return parsed.success ? parsed.data.data.deliveryDepot?.depotCode?.trim() ?? null : null
}

/**
 * The proof-of-delivery photograph on a delivered parcel, where there is one.
 *
 * DPD stopped taking signatures and started taking pictures - the entry is
 * `{ key, type: 'S5', caption: 'Delivered to recipient' }` and it only appears
 * once the parcel has actually been handed over. The key is theirs and is
 * passed through untouched, stars and all.
 */
export function dpdPodImage(parcel: unknown): { key: string; imageType: string } | null {
  const parsed = dpdParcelSchema.safeParse(parcel)
  if (!parsed.success) return null
  for (const image of parsed.data.data.image ?? []) {
    const key = image.key?.trim()
    const imageType = image.type?.trim()
    if (key && imageType) return { key, imageType }
  }
  return null
}

/** Where that picture is served from. */
export function dpdImageUrl(parcelCode: string, image: { key: string; imageType: string }): string {
  return `https://apis.track.dpd.co.uk/v1/parcels/${encodeURI(parcelCode)}/images/${encodeURI(image.key)}`
    + `?imageType=${encodeURIComponent(image.imageType)}`
}

/**
 * The headers that picture needs, which are not the ones anything else needs.
 *
 * Two things, and it is 403 without either: the session cookie minted from the
 * follow-my-parcel code (the same `createSession?parcelCode=…&origin=d` call
 * that `www.dpd.co.uk/d/<code>` makes), and a Referer from that entry path.
 *
 * The parcel-number tracking URL is a different door in; the image endpoint
 * expects the session that came through the short link.
 */
export function dpdImageHeaders(cookie: string, shortCode?: string | null): Record<string, string> {
  const code = shortCode?.trim()
  const Referer = code ? `https://www.dpd.co.uk/d/${code}` : 'https://track.dpd.co.uk/'
  return { cookie, Referer }
}
