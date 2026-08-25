// The `?page=N` rule, in one place because five surfaces need to agree on it:
// the two grid blocks that render the link, the two client pagers that rewrite
// it once the browser has a real URL to work from, and the page routes that
// build the canonical.
//
// It exists so that a shelf can be BOTH things at once. A shopper gets infinite
// scroll: the control is intercepted and the next products arrive in place. A
// crawler has no JavaScript, so it sees an ordinary link to an ordinary page and
// follows it, and the one after that, until the shelf runs out. Same markup,
// same control, two entirely different journeys through it.
//
// Pure, and no imports on purpose - a client pager reaches for this, and a client
// file that can reach the database fails the build-time graph check.

/** The parameter name. A shop already using `?page=` for something else would
 *  collide, but nothing in this platform does, and unlike the filter groups'
 *  slugs this one is not owner-authored - so there is nothing to step aside for. */
export const PAGE_PARAM = 'page'

/** Read a page number off a query string or params object. Anything that is not
 *  a whole number above zero is page one - a crawler or a curious visitor can put
 *  anything in a query string, and "page=banana" is not an error worth having. */
export function pageFromParams(
  params: URLSearchParams | Record<string, string | string[] | undefined> | null | undefined,
): number {
  if (!params) return 1
  const raw = params instanceof URLSearchParams ? params.get(PAGE_PARAM) : params[PAGE_PARAM]
  const value = Array.isArray(raw) ? raw[0] : raw
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 1 ? n : 1
}

/** `query` with the page parameter set to `page`, as a string starting `?` - or
 *  an empty string when nothing is left to say.
 *
 *  Page one drops the parameter rather than spelling it out, so the first page of
 *  a shelf has exactly one address instead of two that a crawler has to be told
 *  are the same thing. Every other parameter is preserved in place, which is what
 *  keeps a filtered view filtered when the shopper pages through it. */
export function withPageParam(query: string, page: number): string {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query)
  if (page > 1) params.set(PAGE_PARAM, String(page))
  else params.delete(PAGE_PARAM)
  const out = params.toString()
  return out ? `?${out}` : ''
}

/** The href a pager control points at. Relative - just the query string - so it
 *  resolves against whatever address the page is actually being served at, which
 *  the block itself has no way of knowing and does not need to. */
export function pageHref(query: string, page: number): string {
  return withPageParam(query, page) || '?'
}

/** ` - Page N`, or nothing at all on page one.
 *
 *  Appended to a paginated page's title so the shelf's pages are not five
 *  documents wearing the same name. It is not vanity: identical titles are how a
 *  set of pages ends up looking like one page repeated, which is exactly the
 *  reading this whole arrangement is trying to avoid. */
export function pageTitleSuffix(page: number): string {
  return page > 1 ? ` - Page ${page}` : ''
}
