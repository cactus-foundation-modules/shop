import { z } from 'zod'
import { parseCourierTimestamp } from '@/modules/shop/lib/tracking/multidrop-page'
import { isMultidropUrl } from '@/modules/shop/lib/tracking/multidrop'

// Where the van is, from the endpoint the courier's own map polls.
//
//   /?action=get_latest_location&cl=<clientID>&route=<routeID>
//   {"vehicle_lng":"-0.027551","vehicle_lat":"51.535283","heading":157,
//    "timestamp":"08/09/2026 14:11:44"}
//
// Unauthenticated, and about a hundred bytes. That size is the reason the live
// map polls THIS and not the tracking page: the page is twelve kilobytes of
// server-rendered HTML and re-reading it every minute to move a marker would be
// rude to a server nobody is paying for.
//
// The reply is parsed with a schema rather than read field by field, because it
// is a third party's JSON arriving on a customer-facing path. Their lat and lng
// are strings today; a release of theirs that made them numbers should move a
// van, not throw inside a page render.

/** Their reply, in their shapes. */
const PositionPayload = z.object({
  vehicle_lat: z.union([z.string(), z.number()]).nullish(),
  vehicle_lng: z.union([z.string(), z.number()]).nullish(),
  heading: z.union([z.string(), z.number()]).nullish(),
  timestamp: z.string().nullish(),
})

export type VehiclePosition = {
  /** In the courier's own digits, exactly as sent - these are copied and handed
   *  to a map, never summed. */
  lat: string
  lng: string
  /** Degrees, for pointing the icon. Null where they did not say. */
  heading: number | null
  /** When the VAN reported, not when we asked. */
  fixedAt: Date | null
}

/** Per request. Their map gives up quietly too; a customer's page must not sit
 *  on a hung socket. */
const TIMEOUT_MS = 6000

/** A latitude or longitude, and nothing else. Guards the whole chain: this
 *  value ends up in a database column, in JSON on a public route, and finally
 *  as a coordinate a map script is asked to fly to. */
const COORDINATE = /^-?\d{1,3}(\.\d{1,10})?$/

function coordinate(value: string | number | null | undefined, limit: number): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (!COORDINATE.test(text)) return null
  const asNumber = Number(text)
  return Math.abs(asNumber) <= limit ? text : null
}

/**
 * The address of the position endpoint for a parcel's tracking page.
 *
 * Built from the tracking URL's own origin rather than a hostname written down
 * here, so a courier who moves to a new domain moves this with them - and
 * checked against the same host test the page reader uses, so a tracking URL
 * pointing anywhere else cannot turn into an outbound request.
 */
export function positionUrl(trackingUrl: string, clientId: string, routeId: string): string | null {
  if (!isMultidropUrl(trackingUrl)) return null
  if (!/^\d{1,12}$/.test(clientId) || !/^\d{1,12}$/.test(routeId)) return null
  const url = new URL(trackingUrl)
  return `${url.origin}/?action=get_latest_location&cl=${clientId}&route=${routeId}`
}

/**
 * Ask where the van is.
 *
 * Null for every kind of no-answer - a timeout, a 500, JSON that is not theirs,
 * a fix with no coordinates in it. Null means "no position this time", never
 * "the van is nowhere", and the caller leaves the last known one alone.
 */
export async function fetchVehiclePosition(url: string, timezone: string): Promise<VehiclePosition | null> {
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

    const parsed = PositionPayload.safeParse(await res.json())
    if (!parsed.success) return null

    const lat = coordinate(parsed.data.vehicle_lat, 90)
    const lng = coordinate(parsed.data.vehicle_lng, 180)
    // Both or neither. Half a position is not a place.
    if (!lat || !lng) return null

    const heading = Number(parsed.data.heading ?? NaN)
    return {
      lat,
      lng,
      heading: Number.isFinite(heading) ? Math.round(((heading % 360) + 360) % 360) : null,
      fixedAt: parseCourierTimestamp(parsed.data.timestamp, timezone),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
