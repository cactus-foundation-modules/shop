import type { VehiclePosition } from '@/modules/shop/lib/tracking/multidrop-position'

// One outbound request per round, however many people are watching it.
//
// The live map is driven by the customer's own page rather than by a schedule,
// which is the only way "while somebody is looking at it" can be known at all.
// The bill for that is arithmetic: a delivery to an office where four people
// have the tracking page open, on a round with eight other drops on it, is
// dozens of requests a minute to a courier's server that nobody is paying for
// and nobody agreed to.
//
// So every viewer of the same ROUND shares one answer. The key is the courier's
// own route id, not the parcel and not the order: two parcels on the same van
// have the same van.
//
// Per instance, deliberately. A shared cache would mean a network round trip to
// save a network round trip, and the thing being protected is the courier's
// server, which sees the sum of all instances - a handful of requests a minute
// at worst, against the one per viewer per minute this replaces.

type Cached = { at: number; value: VehiclePosition | null }

/** Floor between two outbound requests for one round. Below the fast tick on
 *  purpose: a page asking every 60 seconds always gets a fresh answer, and a
 *  page asking faster than it was told to gets the last one. */
export const POSITION_CACHE_MS = 30_000

/** Rounds remembered at once. Well past a busy shop's simultaneous deliveries,
 *  and small enough that a long-running instance cannot grow a map of every
 *  route it has ever seen. */
const MAX_ENTRIES = 500

const entries = new Map<string, Cached>()
const inFlight = new Map<string, Promise<VehiclePosition | null>>()

/** Oldest out first once the map is full. Insertion order is Map's own, and
 *  entries are re-inserted on write, so the first key is the least recently
 *  refreshed. */
function evictIfFull(): void {
  while (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next()
    if (oldest.done) return
    entries.delete(oldest.value)
  }
}

export type CachedPosition = {
  position: VehiclePosition | null
  /** Whether this answer came from the courier just now, as against from the
   *  last viewer's answer. Only a fresh one is worth writing to the database. */
  fetched: boolean
}

/**
 * The van's position for one round, fetching at most once every
 * POSITION_CACHE_MS however many callers ask.
 *
 * Concurrent callers share the one in-flight request rather than starting their
 * own - four tabs loading at the same second is the normal case, not the
 * unusual one, and without this each would open its own socket to the courier.
 */
export async function cachedVehiclePosition(
  routeKey: string,
  load: () => Promise<VehiclePosition | null>,
  now: number = Date.now(),
): Promise<CachedPosition> {
  const cached = entries.get(routeKey)
  if (cached && now - cached.at < POSITION_CACHE_MS) return { position: cached.value, fetched: false }

  const existing = inFlight.get(routeKey)
  if (existing) return { position: await existing, fetched: false }

  const request = load()
    .then((value) => {
      evictIfFull()
      // Stamped with the clock reading this call was made against, not with a
      // fresh one taken when the answer came back. The two differ by the length
      // of the request, and using the later of them would quietly extend every
      // cache entry by however slow the courier was that minute.
      //
      // Deleted first so the re-insert moves it to the end of the map's own
      // order, which is what makes eviction least-recently-refreshed.
      entries.delete(routeKey)
      entries.set(routeKey, { at: now, value })
      return value
    })
    .catch(() => null)
    .finally(() => {
      inFlight.delete(routeKey)
    })

  inFlight.set(routeKey, request)
  return { position: await request, fetched: true }
}

/** Test seam. Nothing in the app calls this - the cache is process-local and
 *  dies with the instance. */
export function resetPositionCache(): void {
  entries.clear()
  inFlight.clear()
}
