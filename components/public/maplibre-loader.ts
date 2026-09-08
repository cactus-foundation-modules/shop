// Loading MapLibre, once, from the CDN.
//
// WHY NOT A DEPENDENCY
//
// A module cannot add npm packages here - a module's package.json carries no
// dependencies, and everything it needs at build time has to be in core's. Half
// a megabyte of map library in every install's bundle, for a feature one shop in
// twenty will switch on, is not a trade core should make on their behalf. So it
// is fetched at runtime, by the one page that needs it, on the one afternoon a
// van is out.
//
// The origin is declared in the module's own manifest (cspOrigins.script and
// .style), which is how it reaches the site's Content-Security-Policy. Without
// that declaration this fails silently, exactly as any blocked script does.
//
// Pinned to an exact version on purpose: an unpinned CDN URL is a promise to
// run whatever a third party publishes next, on a page carrying somebody's
// delivery address.

const VERSION = '3.6.2'
const SCRIPT_URL = `https://unpkg.com/maplibre-gl@${VERSION}/dist/maplibre-gl.js`
const STYLE_URL = `https://unpkg.com/maplibre-gl@${VERSION}/dist/maplibre-gl.css`

/** Only what this module actually calls. Not a re-description of MapLibre's
 *  API - a wrong guess at a method's shape here would be a type that lies. */
export type MapLibreMarker = {
  setLngLat(position: [number, number]): MapLibreMarker
  setRotation(degrees: number): MapLibreMarker
  addTo(map: MapLibreMap): MapLibreMarker
  remove(): void
}

export type MapLibreMap = {
  fitBounds(bounds: unknown, options?: Record<string, unknown>): void
  remove(): void
  on(event: string, handler: () => void): void
}

export type MapLibre = {
  Map: new (options: Record<string, unknown>) => MapLibreMap
  Marker: new (options?: Record<string, unknown>) => MapLibreMarker
  LngLatBounds: new () => { extend(position: [number, number]): void }
  NavigationControl: new (options?: Record<string, unknown>) => unknown
}

declare global {
  interface Window {
    maplibregl?: MapLibre
  }
}

let pending: Promise<MapLibre | null> | null = null

function loadStylesheet(): void {
  if (document.querySelector(`link[href="${STYLE_URL}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = STYLE_URL
  document.head.appendChild(link)
}

/**
 * The MapLibre global, loading it if this is the first ask.
 *
 * Null when it cannot be had - offline, blocked by CSP, blocked by an extension
 * that eats CDNs. Every caller treats null as "no map", and the panel around it
 * still says where the crew is in words. A map is the nice version of that
 * answer, not the answer itself.
 */
export function loadMapLibre(): Promise<MapLibre | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (window.maplibregl) return Promise.resolve(window.maplibregl)
  if (pending) return pending

  pending = new Promise<MapLibre | null>((resolve) => {
    loadStylesheet()

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`)
    const script = existing ?? document.createElement('script')
    const done = () => resolve(window.maplibregl ?? null)

    script.addEventListener('load', done, { once: true })
    script.addEventListener('error', () => resolve(null), { once: true })

    if (!existing) {
      script.src = SCRIPT_URL
      script.async = true
      document.head.appendChild(script)
    }
  }).then((value) => {
    // A failed load is not cached: a customer who was on a train when the page
    // opened should get a map when the tunnel ends, not a permanent no.
    if (!value) pending = null
    return value
  })

  return pending
}
