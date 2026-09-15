// Asking one parcel's courier where it has got to, whoever the courier is.
//
// The poller does not know that Multidrop is HTML and DPD is JSON, that GFS
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
  proofImage: { url: string; headers: Record<string, string> } | null
  /** Ids the live map asks with. Multidrop only - DPD do not give a guest the
   *  round's map, and their driver endpoint has no position on it either. */
  clientId: string | null
  routeId: string | null
  crewLine: string | null
  dropsAway: number | null
  destinationLat: string | null
  destinationLng: string | null
}

const EMPTY_PARCEL_READING: ParcelReading = {
  ...EMPTY_READING,
  multidropHtml: null,
  proofImage: null,
  clientId: null,
  routeId: null,
  crewLine: null,
  dropsAway: null,
  destinationLat: null,
  destinationLng: null,
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

async function readDpdParcelOnce(parcel: ShpShipment, timezone: string): Promise<ParcelReading | null> {
  const parcelCode = dpdParcelCodeFromUrl(parcel.trackingUrl)
  if (!parcelCode) return null

  // One session for the whole parcel, or none at all. Without a follow-my-parcel
  // code this still reads - it just gets the fifteen public fields rather than
  // the ninety, which is a timeline and a status and no stop number.
  const cookie = parcel.trackingShortCode ? await mintDpdSession(parcel.trackingShortCode) : null
  const payloads = await fetchDpdParcel(parcelCode, cookie)
  if (!payloads.parcel && !payloads.events) return null

  // The round only exists while the parcel is on a van, and only a session can
  // see it. Asking otherwise is a guaranteed 404 at somebody else's expense.
  const routeCode = dpdRouteCode(payloads.parcel)
  const route = routeCode && cookie ? await fetchDpdRoute(routeCode, cookie) : null

  const reading = readDpd({ parcel: payloads.parcel, events: payloads.events, route, timezone })
  if (!reading.stage) return null

  // Their photograph of the delivered parcel, which replaced the signature they
  // used to take. Only on a delivered parcel, and only with the session - see
  // dpdImageHeaders for the Referer that decides between a picture and a 403.
  const image = dpdPodImage(payloads.parcel)
  const proofImage = image && cookie
    ? { url: dpdImageUrl(parcelCode, image), headers: dpdImageHeaders(cookie) }
    : null

  return {
    ...EMPTY_PARCEL_READING,
    ...reading,
    proofImage,
    // Their route id, kept for the same reason Multidrop's is: it says which
    // round the parcel was on, and it changes daily.
    routeId: routeCode,
    clientId: dpdDepotCode(payloads.parcel),
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
    default:
      return null
  }
}
