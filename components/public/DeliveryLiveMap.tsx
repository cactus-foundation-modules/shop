'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { loadMapLibre, type MapLibreMap, type MapLibreMarker } from '@/modules/shop/components/public/maplibre-loader'
import { freshnessFromAge, MAX_LIVE_SESSION_MS, SLOW_POLL_MS } from '@/modules/shop/lib/tracking/live-delivery'

// The van, while it is on its way.
//
// Three things in one panel, in the order somebody cares about them: the
// courier's own sentence about how far off the crew is, a map with the van on
// it, and - last but never optional - how old that position actually is.
//
// WHY THE PAGE POLLS AND THE SERVER DOES NOT
//
// The condition worth polling on is "somebody is watching this", and no
// schedule can know that. A tab that is closed, or behind another window, costs
// the courier nothing at all. The interval comes back from the server with each
// answer - five minutes normally, one minute once the crew's own sentence says
// we are next - so how often to ask is a decision made where the drop count is
// known, not a number written into a bundle.
//
// AND WHY IT STOPS
//
// After an hour it gives up and asks for a refresh, the way the courier's own
// page gives up after thirty ticks. A page left open on a kitchen worktop
// should not still be asking a courier where a van is at teatime.

export type LiveVehicle = {
  lat: string
  lng: string
  heading: number | null
  fixedAt: string | null
}

export type LiveDeliveryState = {
  /** Whether there is any point asking again. */
  live: boolean
  /** The courier's own words, shown as they wrote them. */
  crewLine: string | null
  dropsAway: number | null
  destination: { lat: string; lng: string } | null
  arrived: boolean
  pollAfterMs: number
  position?: LiveVehicle | null
  /** 'Updated 1 minute ago', and whether that is old enough to distrust.
   *  Worded on the server so one visitor's wrong clock cannot age a delivery. */
  freshness?: { text: string; stale: boolean; ageMs?: number; clock?: 'van' | 'us' } | null
  /** The server has just learned the parcel arrived. Reload so the rest of the
   *  page - the progress rail, the tracking lines - catches up. */
  refreshPage?: boolean
}

type Props = {
  orderId: string
  shipmentId: string
  initial: LiveDeliveryState
}

/** Free vector tiles, no key, commercial use allowed. Deliberately not the
 *  courier's own tile server, which is their bill and not ours to spend. */
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

const VAN_ICON = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 3l7 8h-4v10h-6V11H5z"/></svg>`

const HOME_ICON = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>`

function markerElement(html: string, className: string): HTMLElement {
  const element = document.createElement('div')
  element.className = className
  element.innerHTML = html
  return element
}

function asPosition(point: { lat: string; lng: string }): [number, number] {
  return [Number(point.lng), Number(point.lat)]
}

/** Room round the pins, so neither sits under the edge or the attribution. */
const FIT_PADDING = 60
/** Close enough to read the streets once the van is round the corner, and no
 *  closer: two pins a few doors apart would otherwise zoom to the brickwork. */
const FIT_MAX_ZOOM = 16

/** The box holding the van and, when we have it, the delivery address. */
function framing(
  van: { lat: string; lng: string },
  home: { lat: string; lng: string } | null,
): [[number, number], [number, number]] {
  const points = home ? [asPosition(van), asPosition(home)] : [asPosition(van)]
  const lngs = points.map((p) => p[0])
  const lats = points.map((p) => p[1])
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ]
}

export default function DeliveryLiveMap({ orderId, shipmentId, initial }: Props) {
  const [state, setState] = useState<LiveDeliveryState>(initial)
  const [expired, setExpired] = useState(false)
  const [mapFailed, setMapFailed] = useState(false)

  const container = useRef<HTMLDivElement | null>(null)
  const map = useRef<MapLibreMap | null>(null)
  const vanMarker = useRef<MapLibreMarker | null>(null)
  // Set on the first tick rather than at render: reading a clock while
  // rendering is impure, and the value is only ever wanted inside the loop.
  const startedAt = useRef<number>(0)

  const position = state.position ?? null

  // The freshness line counts on between answers. The server says how old the
  // position was when it answered; the page adds how long it has been holding
  // that answer, timed on its own stopwatch, so a visitor's wrong clock still
  // cannot age a delivery.
  // The stopwatch reading is tied to the answer it was timed against, so a new
  // answer starts from nought without anything having to reset it.
  const [held, setHeld] = useState<{ answer: LiveDeliveryState['freshness']; ms: number } | null>(null)
  useEffect(() => {
    const answer = state.freshness
    if (state.arrived || expired || typeof answer?.ageMs !== 'number') return
    const answeredAt = Date.now()
    const timer = setInterval(() => setHeld({ answer, ms: Date.now() - answeredAt }), 1000)
    return () => clearInterval(timer)
  }, [state.freshness, state.arrived, expired])
  const heldFor = held && held.answer === state.freshness ? held.ms : 0
  const freshness =
    state.freshness && typeof state.freshness.ageMs === 'number'
      ? freshnessFromAge(state.freshness.ageMs + heldFor, state.freshness.clock)
      : state.freshness

  const refresh = useCallback(async (): Promise<number> => {
    try {
      const res = await fetch(
        `/api/m/shop/public/orders/${encodeURIComponent(orderId)}/live-delivery?shipment=${encodeURIComponent(shipmentId)}`,
        { cache: 'no-store' },
      )
      // A refusal is not evidence the van has stopped. The last answer stays on
      // screen with its own honest age against it, and we simply ask again later.
      if (!res.ok) return SLOW_POLL_MS
      const next = (await res.json()) as LiveDeliveryState
      if (next.refreshPage) {
        window.location.reload()
        return SLOW_POLL_MS
      }
      setState(next)
      return next.pollAfterMs > 0 ? next.pollAfterMs : SLOW_POLL_MS
    } catch {
      return SLOW_POLL_MS
    }
  }, [orderId, shipmentId])

  // The polling loop. A chain of timeouts rather than an interval, because the
  // gap is decided by each answer - and because an interval keeps firing into a
  // request that has not come back yet.
  useEffect(() => {
    if (!state.live || state.arrived || expired) return
    if (startedAt.current === 0) startedAt.current = Date.now()

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      if (cancelled) return
      if (Date.now() - startedAt.current > MAX_LIVE_SESSION_MS) {
        setExpired(true)
        return
      }
      // Nothing is asked while the tab is in the background. The listener below
      // picks it straight back up when somebody looks again.
      const wait = document.visibilityState === 'visible' ? await refresh() : SLOW_POLL_MS
      if (!cancelled) timer = setTimeout(tick, wait)
    }

    timer = setTimeout(tick, state.pollAfterMs > 0 ? state.pollAfterMs : SLOW_POLL_MS)

    const onVisible = () => {
      if (document.visibilityState !== 'visible' || cancelled) return
      if (Date.now() - startedAt.current > MAX_LIVE_SESSION_MS) return setExpired(true)
      clearTimeout(timer)
      void tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [state.live, state.arrived, state.pollAfterMs, expired, refresh])

  // The map itself, built once there is somewhere to put it and something to
  // put on it. A failure to load leaves the words in place - see the loader.
  useEffect(() => {
    if (!position || !container.current || map.current) return

    let cancelled = false
    void loadMapLibre().then((maplibre) => {
      if (cancelled || !maplibre || !container.current || map.current) {
        if (!maplibre) setMapFailed(true)
        return
      }

      const instance = new maplibre.Map({
        container: container.current,
        style: MAP_STYLE,
        // Opens framed on the van and the delivery address together, so the
        // customer sees where the crew is in relation to them, not just a van.
        bounds: framing(position, state.destination),
        fitBoundsOptions: { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM },
        attributionControl: { compact: true },
        // Nothing on this map is worth spinning or tilting, and both gestures
        // are easy to trigger by accident on a phone held one-handed.
        pitchWithRotate: false,
        dragRotate: false,
        touchZoomRotate: false,
      })
      instance.on('error', () => setMapFailed(true))

      vanMarker.current = new maplibre.Marker({ element: markerElement(VAN_ICON, 'sod-van-pin') })
        .setLngLat(asPosition(position))
        .addTo(instance)

      // Not kept in a ref: it never moves, and removing the map takes its
      // markers with it.
      if (state.destination) {
        new maplibre.Marker({ element: markerElement(HOME_ICON, 'sod-home-pin') })
          .setLngLat(asPosition(state.destination))
          .addTo(instance)
      }

      map.current = instance
    })

    return () => {
      cancelled = true
    }
  }, [position, state.destination])

  // Moving what is already there, rather than rebuilding it, then reframing so
  // the van and the address are both in view again - zooming in as the van gets
  // closer. Without the reframe the pin simply drives off the edge.
  useEffect(() => {
    if (!map.current || !position) return
    vanMarker.current?.setLngLat(asPosition(position))
    if (typeof position.heading === 'number') vanMarker.current?.setRotation(position.heading)
    map.current.fitBounds(framing(position, state.destination), {
      padding: FIT_PADDING,
      maxZoom: FIT_MAX_ZOOM,
      duration: 800,
    })
  }, [position, state.destination])

  useEffect(() => {
    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  if (state.arrived) return null
  if (!state.crewLine && !position) return null

  return (
    <section className="sod-live" aria-label="Where your delivery is">
      {state.crewLine && <p className="sod-live-line">{state.crewLine}</p>}

      {position && !mapFailed && <div className="sod-live-map" ref={container} role="presentation" />}

      <p className={freshness?.stale ? 'sod-live-age sod-live-age-stale' : 'sod-live-age'}>
        {expired
          ? 'Refresh the page for the latest position.'
          : (freshness?.text ?? 'Waiting for the crew to report their position.')}
      </p>

      {/* Their disclaimer, in our words. A live position is a courtesy and not
          a promise, and saying so once here is fairer than explaining it on the
          phone afterwards. */}
      <p className="sod-live-note">
        The crew&rsquo;s position is passed on by the courier as they drive, so it can lag behind
        or pause. Traffic and a change of route can both move things about.
      </p>
    </section>
  )
}
