// Asking one parcel's courier where it has got to, whoever the courier is.
//
// The poller does not know that Multidrop is HTML and DPD, AIT and Fieldly are JSON, that GFS
// wants a carrier name in the query string, or that DPD's useful feed needs a
// session minted first. It hands a parcel over and gets a reading back, and
// every reader answers in the same terms - see reading.ts.
//
// The couriers a shop uses are settings, so the set of readers is the one thing
// here that IS code: each is a different shape of request against a different
// company's server, and no amount of configuration turns an HTML timeline into
// a JSON payload. What each reader FINDS is settings again, immediately: the
// stage's meaning is per courier, applied on the way out.

import { isMultidropUrl, furthestStage, parseMultidropStages } from '@/modules/shop/lib/tracking/multidrop'
import {
  dropsAwayFromCrewLine,
  parseCrewLine,
  parseTrackingConfig,
} from '@/modules/shop/lib/tracking/multidrop-page'
import { gfsParcelNumberFromUrl, gfsScanUrl, readGfsPage } from '@/modules/shop/lib/tracking/gfs'
import {
  dpdDepotCode,
  dpdImageHeaders,
  dpdImageUrl,
  dpdParcelCodeFromUrl,
  dpdPodImage,
  dpdRouteCode,
  readDpd,
} from '@/modules/shop/lib/tracking/dpd'
import { fetchDpdParcel, fetchDpdRoute, mintDpdSession } from '@/modules/shop/lib/tracking/dpd-session'
import { findDpdConsignment, mergeConsignmentBoxes } from '@/modules/shop/lib/tracking/dpd-consignment'
import { dpdFollowLinkCode } from '@/modules/shop/lib/tracking/dpd-follow-link'
import { isSplitConsignment, type ConsignmentParcel } from '@/modules/shop/lib/consignment-parcels'
import { aitImageHeaders, readAit } from '@/modules/shop/lib/tracking/ait'
import { aitLinkParts } from '@/modules/shop/lib/tracking/ait-link'
import { readFieldly } from '@/modules/shop/lib/tracking/fieldly'
import { EMPTY_READING, type TrackingReading } from '@/modules/shop/lib/tracking/reading'
import type { ShpCourier } from '@/modules/shop/lib/courier-faqs'
import type { ShpShipment } from '@/modules/shop/lib/types'

/** Per request. Long enough for a slow page, short enough that a hung server
 *  cannot hold a whole run open. */
const TIMEOUT_MS = 8000

export type ParcelReading = TrackingReading & {
  /** The Multidrop page, kept so the caller can go on to read a signature off
   *  it. Nothing else needs it, and no other reader has one. */
  multidropHtml: string | null
  /** A proof-of-delivery picture the caller may fetch and keep, where the
   *  courier has one. The headers come with it because some couriers serve it
   *  from a session rather than a public bucket, and the reader is the only
   *  thing here holding that session. */
  proofImage: { url: string; headers: Record<string, string>; label: string } | null
  /** Where the crew is, where the courier hands that over in the same answer
   *  as everything else (AIT). Carries no time of its own: the caller records
   *  when it asked. Multidrop's van comes from a separate endpoint instead -
   *  see multidrop-position.ts - and leaves this null. */
  vehicle: { lat: string; lng: string } | null
  /** Ids the live map asks with. Multidrop only - DPD do not give a guest the
   *  round's map, and their driver endpoint has no position on it either. */
  clientId: string | null
  routeId: string | null
  crewLine: string | null
  dropsAway: number | null
  destinationLat: string | null
  destinationLng: string | null
  /** The boxes this parcel is travelling as, where the courier splits a
   *  delivery (DPD), to be written back whole - and each box's photograph to
   *  fetch and keep, which only the reader holding the sessions can hand over.
   *  Null from every other courier, and on a read that learned nothing new. */
  consignment: ConsignmentReading | null
}

export type ConsignmentReading = {
  number: string
  parcels: ConsignmentParcel[]
  photos: Array<{ code: string; ref: string; url: string; headers: Record<string, string> }>
}

const EMPTY_PARCEL_READING: ParcelReading = {
  ...EMPTY_READING,
  multidropHtml: null,
  proofImage: null,
  vehicle: null,
  clientId: null,
  routeId: null,
  crewLine: null,
  dropsAway: null,
  destinationLat: null,
  destinationLng: null,
  consignment: null,
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'CactusShopDeliveryTracking/1.0 (+order status)' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    // A timeout, a DNS failure, a courier having an afternoon. Silence is not
    // evidence of anything, and least of all of a parcel not having arrived.
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function readMultidrop(trackingUrl: string): Promise<ParcelReading | null> {
  const html = await fetchText(trackingUrl)
  if (!html) return null
  const stage = furthestStage(parseMultidropStages(html))
  if (!stage) return null

  const page = parseTrackingConfig(html)
  const crewLine = parseCrewLine(html)
  return {
    ...EMPTY_PARCEL_READING,
    stage: stage.label,
    multidropHtml: html,
    clientId: page.clientId,
    routeId: page.routeId,
    crewLine,
    dropsAway: dropsAwayFromCrewLine(crewLine),
    destinationLat: page.destinationLat,
    destinationLng: page.destinationLng,
  }
}

async function readGfs(parcel: ShpShipment, carrier: string, timezone: string): Promise<ParcelReading | null> {
  // The parcel number can come from either field, because both hold it on some
  // shop somewhere: the number was typed in long before tracking links were,
  // and a link carries it too.
  const number = gfsParcelNumberFromUrl(parcel.trackingUrl) ?? gfsParcelNumberFromUrl(parcel.trackingNumber)
  if (!number) return null
  const html = await fetchText(gfsScanUrl(number, carrier))
  if (!html) return null
  const reading = readGfsPage(html, timezone)
  return reading.stage ? { ...EMPTY_PARCEL_READING, ...reading } : null
}

/** One DPD box, read on its own session where it has a code of its own. */
async function readDpdBox(
  parcelCode: string,
  shortCode: string | null,
  timezone: string,
): Promise<{ reading: TrackingReading; payload: unknown; cookie: string | null; routeCode: string | null } | null> {
  // One session for the box, or none at all. Without a follow-my-parcel code
  // this still reads - it just gets the fifteen public fields rather than the
  // ninety, which is a timeline and a status and no stop number.
  const session = shortCode ? await mintDpdSession(shortCode) : null
  const cookie = session?.cookie ?? null
  const payloads = await fetchDpdParcel(parcelCode, cookie)
  if (!payloads.parcel && !payloads.events) return null

  // The round only exists while the parcel is on a van, and only a session can
  // see it. Asking otherwise is a guaranteed 404 at somebody else's expense.
  const routeCode = dpdRouteCode(payloads.parcel)
  const route = routeCode && cookie ? await fetchDpdRoute(routeCode, cookie) : null

  const reading = readDpd({ parcel: payloads.parcel, events: payloads.events, route, timezone })
  if (!reading.stage) return null
  return { reading, payload: payloads.parcel, cookie, routeCode }
}

/** Their photograph of the delivered box, which replaced the signature they
 *  used to take. Only on a delivered box, and only with the session that
 *  box's own code opened - see dpdImageHeaders. */
function dpdProof(parcelCode: string, payload: unknown, cookie: string | null, shortCode: string | null) {
  const image = dpdPodImage(payload)
  return image && cookie
    ? { ref: image.key, url: dpdImageUrl(parcelCode, image), headers: dpdImageHeaders(cookie, shortCode) }
    : null
}

/**
 * A parcel the courier is carrying as several boxes, read box by box.
 *
 * Each box is asked about on its own session, one after another - the codes
 * are separate sessions, and DPD spoil a session asked two things at once. A
 * box already delivered with its photograph kept, or delivered with no code
 * to fetch one with, has nothing left to say and is not asked.
 *
 * The parcel has arrived when every box has, and not before. Until then the
 * reading the parcel shows is the first box still to come - its stage, its
 * window, its driver - because that is the delivery the customer is waiting
 * on. Null when the boxes still to come could not be read: a parcel cannot be
 * called anything on the strength of the boxes that already landed.
 */
async function readDpdConsignment(
  number: string,
  boxes: ConsignmentParcel[],
  timezone: string,
): Promise<ParcelReading | null> {
  const now = new Date().toISOString()
  const parcels: ConsignmentParcel[] = []
  const photos: ConsignmentReading['photos'] = []
  const fresh = new Map<string, NonNullable<Awaited<ReturnType<typeof readDpdBox>>>>()

  for (const box of boxes) {
    if (box.delivered && (box.photoUrl || !box.shortCode)) {
      parcels.push(box)
      continue
    }
    const read = await readDpdBox(box.code, box.shortCode, timezone)
    if (!read) {
      parcels.push(box)
      continue
    }
    fresh.set(box.code, read)
    // Never taken back, as the parcel's own delivered_at is not.
    const delivered = box.delivered || read.reading.delivered === true
    parcels.push({
      ...box,
      stage: read.reading.stage ?? box.stage,
      delivered,
      deliveredAt: box.deliveredAt ?? (delivered ? (read.reading.receivedAt ?? new Date()).toISOString() : null),
      receivedBy: read.reading.receivedBy ?? box.receivedBy,
      checkedAt: now,
    })
    const proof = delivered && !box.photoUrl ? dpdProof(box.code, read.payload, read.cookie, box.shortCode) : null
    if (proof) photos.push({ code: box.code, ...proof })
  }

  const allDelivered = parcels.every((p) => p.delivered)
  const waitingOn = parcels.find((p) => !p.delivered && fresh.has(p.code))
  const latest = [...parcels]
    .filter((p) => p.delivered && fresh.has(p.code))
    .sort((a, b) => (a.deliveredAt ?? '').localeCompare(b.deliveredAt ?? ''))
    .at(-1)
  const primary = allDelivered ? latest : waitingOn
  // The box still to come could not be read, or nothing was asked at all.
  // What the boxes that landed said is not lost: they are asked again next
  // time, and they will say the same.
  if (!primary) return null
  const read = fresh.get(primary.code)
  if (!read) return null

  return {
    ...EMPTY_PARCEL_READING,
    ...read.reading,
    // Explicitly false until the last box is in: the stage settings must not
    // get a vote on a parcel the courier has told us is only part-delivered.
    delivered: allDelivered,
    outForDelivery: allDelivered ? false : read.reading.outForDelivery,
    receivedBy: allDelivered ? read.reading.receivedBy : null,
    receivedAt: allDelivered ? read.reading.receivedAt : null,
    routeId: read.routeCode,
    clientId: dpdDepotCode(read.payload),
    consignment: { number, parcels, photos },
  }
}

async function readDpdParcelOnce(parcel: ShpShipment, timezone: string): Promise<ParcelReading | null> {
  // Already known to be several boxes: each is read in its own right.
  if (isSplitConsignment(parcel.consignmentParcels) && parcel.consignmentNumber) {
    return readDpdConsignment(parcel.consignmentNumber, parcel.consignmentParcels, timezone)
  }

  // The parcel number from the tracking link where it is one, else from where
  // the short link points. A parcel recorded with only the follow-my-parcel
  // link - in both boxes, as it arrives in DPD's email - has no parcel number
  // anywhere else, and went unread every hour until the order was closed.
  // The code beside the link, or in it: a follow-my-parcel link recorded on a
  // courier known only by its typed name is kept with no code beside it.
  const shortCode = parcel.trackingShortCode ?? dpdFollowLinkCode(parcel.trackingUrl)
  const session = shortCode ? await mintDpdSession(shortCode) : null
  const cookie = session?.cookie ?? null
  const parcelCode = dpdParcelCodeFromUrl(parcel.trackingUrl) ?? session?.parcelCode ?? null
  if (!parcelCode) return null

  const payloads = await fetchDpdParcel(parcelCode, cookie)
  if (!payloads.parcel && !payloads.events) return null

  // Never asked how many boxes this is. Asked once, anonymously; a delivery
  // that turns out to be several is read box by box from here on - this
  // reading included, so the first look at a split delivery cannot call it
  // delivered on the strength of the one box in hand.
  let consignment: ConsignmentReading | null = null
  if (parcel.consignmentParcels === null) {
    const found = await findDpdConsignment(parcelCode, payloads.parcel)
    if (found) {
      const boxes = mergeConsignmentBoxes(found.boxes, null).map((box) => (
        box.code === parcelCode ? { ...box, shortCode } : box
      ))
      if (isSplitConsignment(boxes)) return readDpdConsignment(found.consignmentNumber, boxes, timezone)
      consignment = { number: found.consignmentNumber, parcels: boxes, photos: [] }
    }
  }

  const routeCode = dpdRouteCode(payloads.parcel)
  const route = routeCode && cookie ? await fetchDpdRoute(routeCode, cookie) : null

  const reading = readDpd({ parcel: payloads.parcel, events: payloads.events, route, timezone })
  if (!reading.stage) return null

  const proof = dpdProof(parcelCode, payloads.parcel, cookie, shortCode)
  return {
    ...EMPTY_PARCEL_READING,
    ...reading,
    proofImage: proof ? { url: proof.url, headers: proof.headers, label: 'delivery-photo' } : null,
    // Their route id, kept for the same reason Multidrop's is: it says which
    // round the parcel was on, and it changes daily.
    routeId: routeCode,
    clientId: dpdDepotCode(payloads.parcel),
    consignment,
  }
}

async function readDpdParcel(parcel: ShpShipment, timezone: string): Promise<ParcelReading | null> {
  // One quiet retry: a parcel that was out for delivery a minute ago and now
  // reads as nothing is usually a timeout, not a courier who changed their
  // mind. The hourly job has no other chance to ask for another hour.
  const first = await readDpdParcelOnce(parcel, timezone)
  if (first) return first
  await new Promise((resolve) => setTimeout(resolve, 750))
  return readDpdParcelOnce(parcel, timezone)
}

async function readAitParcel(parcel: ShpShipment): Promise<ParcelReading | null> {
  const parts = aitLinkParts(parcel.trackingUrl)
  if (!parts) return null
  const reading = await readAit(parcel.trackingUrl)
  if (!reading?.stage) return null
  const { vehicle, destinationLat, destinationLng, dropsAway, signatureImageUrl, clientId, routeId, ...common } = reading
  return {
    ...EMPTY_PARCEL_READING,
    ...common,
    vehicle,
    destinationLat,
    destinationLng,
    dropsAway,
    clientId,
    routeId,
    // Their signature, from wherever they keep it. Fetched with their tracking
    // page as the Referer, in case the picture sits behind the same gate as
    // the feed does.
    proofImage: signatureImageUrl
      ? { url: signatureImageUrl, headers: aitImageHeaders(parts.region), label: 'delivery-signature' }
      : null,
  }
}

async function readFieldlyParcel(parcel: ShpShipment, timezone: string): Promise<ParcelReading | null> {
  const reading = await readFieldly(parcel.trackingUrl, timezone)
  if (!reading?.stage) return null
  const { proofImageUrl, proofImageLabel, dropsAway, ...common } = reading
  return {
    ...EMPTY_PARCEL_READING,
    ...common,
    dropsAway,
    proofImage: proofImageUrl ? { url: proofImageUrl, headers: {}, label: proofImageLabel } : null,
  }
}

/**
 * One look at one parcel.
 *
 * Null means nothing was learned - the request failed, or the page loaded and
 * said nothing this reader recognised. The caller stamps the parcel as checked
 * and concludes NOTHING from it: a courier's website being down is not a parcel
 * standing still.
 */
export async function readParcelTracking(
  courier: Pick<ShpCourier, 'trackingSource' | 'gfsCarrier'>,
  parcel: ShpShipment,
  /** The site's timezone. Couriers print wall-clock times with no offset, and
   *  an instant built without this is an hour out for most of the year. */
  timezone: string,
): Promise<ParcelReading | null> {
  switch (courier.trackingSource) {
    case 'multidrop':
      return isMultidropUrl(parcel.trackingUrl) ? readMultidrop(parcel.trackingUrl as string) : null
    case 'gfs':
      return readGfs(parcel, courier.gfsCarrier, timezone)
    case 'dpd':
      return readDpdParcel(parcel, timezone)
    case 'ait':
      return readAitParcel(parcel)
    case 'fieldly':
      return readFieldlyParcel(parcel, timezone)
    default:
      return null
  }
}
