// Getting DPD to talk, which takes one extra call and a cookie.
//
// Their public feed answers anybody. The useful feed - the round, the stop
// number, the minutes away - answers a SESSION, and a session is minted by
// handing back the code from the follow-my-parcel link they email:
//
//   GET /v1/createSession?parcelCode=<shortCode>&origin=d   -> 302 + sessionId
//
// No postcode and no reCAPTCHA on that route, which is what makes it usable
// from a schedule at all: their other way in, POST /v1/login with the delivery
// postcode, demands a reCAPTCHA token and always will.
//
// The cookie lasts about a day and is minted fresh on every poll rather than
// stored. It costs one small request, it cannot go stale halfway through a
// delivery, and a session key kept in a database is a thing to leak for no gain.
//
// Everything here fails to null rather than throwing. A courier having an
// afternoon must cost this parcel one poll, not the whole run.

const API = 'https://apis.track.dpd.co.uk/v1'
const TIMEOUT_MS = 8000

/** Ours, and honest about it. A tracking feed read on a schedule should be
 *  identifiable by the people serving it. */
const USER_AGENT = 'CactusShopDeliveryTracking/1.0 (+order status)'

async function request(url: string, cookie: string | null, redirect: RequestRedirect): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect,
      cache: 'no-store',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/json, text/plain, */*',
        ...(cookie ? { cookie } : {}),
      },
    })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * A session cookie for one parcel, or null.
 *
 * `redirect: 'manual'` matters: the response that carries the cookie is the
 * 302, and following it lands on the tracking page and loses the header.
 */
export async function mintDpdSession(shortCode: string): Promise<string | null> {
  const url = `${API}/createSession?parcelCode=${encodeURIComponent(shortCode)}&origin=d`
  const res = await request(url, null, 'manual')
  if (!res) return null
  const cookies = res.headers.getSetCookie?.() ?? []
  const session = cookies
    .map((line) => line.split(';')[0]?.trim() ?? '')
    .filter((pair) => pair.startsWith('sessionId='))
  return session.length > 0 ? session.join('; ') : null
}

/** One JSON call, parsed loosely - the schemas in dpd.ts do the checking, and
 *  a body that is not JSON at all is the same nothing as a timeout. */
async function json(path: string, cookie: string | null): Promise<unknown | null> {
  const res = await request(`${API}${path}`, cookie, 'follow')
  if (!res || !res.ok) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

export type DpdPayloads = {
  parcel: unknown | null
  events: unknown | null
  /** Whether the rich feed answered. Recorded so a run can say "read
   *  anonymously" rather than leaving somebody to wonder why the stop number
   *  went missing on a parcel that had one yesterday. */
  session: boolean
}

/**
 * Everything DPD will say about one parcel, in as few calls as it takes.
 *
 * The cookie is minted once and handed back to the caller, because the route
 * call needs the same one: minting a second would double the requests for a
 * session we are already holding.
 */
export async function fetchDpdParcel(parcelCode: string, cookie: string | null): Promise<DpdPayloads> {
  const code = encodeURI(parcelCode)
  const [parcel, events] = await Promise.all([
    json(`/parcels/${code}`, cookie),
    json(`/parcels/${code}/parcelevents`, cookie),
  ])
  return { parcel, events, session: Boolean(cookie) && parcel !== null }
}

/** The round, once the parcel payload has named one. A separate call because it
 *  is a separate resource, and one that only exists on the day: asking before
 *  the parcel is on a van is a guaranteed 404 at somebody else's expense. */
export async function fetchDpdRoute(routeCode: string, cookie: string | null): Promise<unknown | null> {
  if (!cookie) return null
  return json(`/routes/${encodeURI(routeCode)}`, cookie)
}
