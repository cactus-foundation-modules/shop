import { MAX_DIRECT_UPLOAD_MB, tooLargeReason, uploadErrorMessage } from '@/lib/media/limits'
import { WORKER_OUTDATED_MESSAGE, directUnavailableMessage } from '@/modules/shop/lib/direct-upload'

// The browser's half of a shop upload that goes straight to storage (see
// lib/direct-upload.ts). Asks the shop route for a signed place to put the file,
// then PUTs it there. What the route does with it afterwards - record a download,
// start an import - is the caller's second call, because that is where the two
// uploads differ.
//
// Dependency-free apart from fetch, like core's own lib/media/upload-client.ts,
// so it is safe in any client component.

/** Where the file went: hand both back to the route so it can check the landing. */
export type SentToStorage = { ok: true; key: string; token: string } | { ok: false; error: string }

type Ticket = { available: true; uploadUrl: string; key: string; token: string; contentType: string } | { available: false }

function isTicket(value: unknown): value is Ticket {
  if (typeof value !== 'object' || value === null || !('available' in value)) return false
  const t = value as Record<string, unknown>
  if (t.available === false) return true
  return t.available === true
    && typeof t.uploadUrl === 'string'
    && typeof t.key === 'string'
    && typeof t.token === 'string'
    && typeof t.contentType === 'string'
}

/**
 * The words for a failed call to one of the shop's own routes.
 *
 * core's uploadErrorMessage is right for everything except a 413: it assumes any
 * 413 is the hosting platform refusing a body over the form ceiling, and says so
 * with that ceiling's number. A JSON call to the shop is a few hundred bytes, so
 * a 413 from one is the route itself refusing the file, and its own sentence -
 * with the real limit and what to do about it - is the one to show.
 */
export async function shopRouteError(res: Response, file: { name: string; size: number }, limitMb: number): Promise<string> {
  if (res.status === 413) {
    const data: unknown = await res.json().catch(() => null)
    const error = typeof data === 'object' && data !== null && 'error' in data ? (data as { error: unknown }).error : null
    return typeof error === 'string' && error ? error : `"${file.name}": ${tooLargeReason(file.size, limitMb)}`
  }
  return uploadErrorMessage(res, file)
}

/**
 * Put `file` into storage by way of `route`.
 *
 * - `limitMb` is the ceiling the route holds this upload to, for the sentence
 *   when it refuses.
 * - `prepare` is whatever else the route wants to know before it signs anything
 *   (the declared type, for a download); the action, name and size are added here.
 * - `advice` is said after "this storage cannot take it", when the owner has a
 *   way round it other than changing storage - splitting a sheet, say.
 */
export async function sendToStorage(
  route: string,
  file: File,
  options: { limitMb: number; prepare?: Record<string, string>; advice?: string },
): Promise<SentToStorage> {
  const { limitMb, prepare = {}, advice } = options
  let ticket: Ticket
  try {
    const res = await fetch(route, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...prepare, action: 'prepare', filename: file.name, sizeBytes: file.size }),
    })
    if (!res.ok) return { ok: false, error: await shopRouteError(res, file, limitMb) }
    const data: unknown = await res.json().catch(() => null)
    if (!isTicket(data)) return { ok: false, error: `"${file.name}" could not be uploaded: the site's reply could not be read. Try again.` }
    ticket = data
  } catch {
    return { ok: false, error: `"${file.name}" could not be uploaded: the site could not be reached. Check your connection and try again.` }
  }
  if (!ticket.available) return { ok: false, error: advice ? `${directUnavailableMessage(file)} ${advice}` : directUnavailableMessage(file) }

  let put: Response
  try {
    // fetch sends a File's length for it, which the Worker insists on: it will
    // not take a body it cannot size before reading.
    put = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: { authorization: `Bearer ${ticket.token}`, 'content-type': ticket.contentType },
      body: file,
    })
  } catch {
    return { ok: false, error: `The connection dropped while "${file.name}" was being sent to storage. Check your connection and try again.` }
  }
  if (!put.ok) {
    // 415 is a Worker that predates opaque files; 503 is one deployed without
    // uploads switched on at all. Redeploying cures both.
    if (put.status === 415 || put.status === 503) return { ok: false, error: WORKER_OUTDATED_MESSAGE }
    if (put.status === 413) return { ok: false, error: `"${file.name}": ${tooLargeReason(file.size, MAX_DIRECT_UPLOAD_MB)}` }
    // The token was signed a moment ago, so a refusal of it is not the clock: it
    // is a Worker holding a signing key from before this site's secret changed.
    if (put.status === 403) {
      return { ok: false, error: 'Your media service turned the file away because it no longer recognises this site. Go to Settings → Media and deploy the Worker again, then try once more.' }
    }
    return { ok: false, error: await uploadErrorMessage(put, file) }
  }

  return { ok: true, key: ticket.key, token: ticket.token }
}
