'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ShopGridCardLoader } from '@/modules/shop/lib/grid-page-types'
import { pageHref } from '@/modules/shop/lib/page-href'

// Paging for the shop's product grids.
//
// The cards arrive already rendered - the server builds every one of them with
// the shop's own Product Card layout and hands them in as children - and this
// only decides how many of them are on screen. That is deliberate rather than
// lazy: a card is a Puck document stamped per product, so rendering the later
// pages in the browser would mean shipping the card template and every part
// block to the client, and the two halves would drift the first time anyone
// edited the layout. Showing and hiding finished cards keeps one render path.
//
// It also means paging is instant and survives a filter: the filter shell
// already works by hiding cards it has in hand, and this sits alongside it
// rather than fighting it for the same DOM.
//
// The trade is payload. A category of 217 products ships 217 cards whether the
// shopper looks at page 1 or page 9, which is why the grid blocks only reach
// for this when the shop owner asks - see the `paginate` prop.
//
// UNLESS the block hands over a `loadMore`. Then the server renders the first
// page only and this asks for the rest as the shopper reaches them - the same
// cards, built by the same helpers on the same server, arriving as React nodes
// down the same flight channel rather than as markup. That is what keeps the
// one-render-path promise above intact while a 432-product page stops shipping
// 14.6 MB to a shopper who was going to look at twenty-four of them. Everything
// below still works exactly as it did when `loadMore` is absent: the two modes
// differ in where the later cards come from, not in what they are.

// 'scroll' is 'more' that presses its own button: the same window, grown by the
// same handler, triggered by a sentinel coming into view instead of a click.
//
// The button is NOT removed in scroll mode, and that is the whole design. An
// observer that fires on scroll cannot be reached by a keyboard, is invisible to
// a screen reader, and does nothing at all if the browser has no
// IntersectionObserver or the page never scrolls (a short viewport, a zoomed-in
// shopper, a filtered list of nine). So the control stays and stays focusable,
// and the auto-load is a convenience layered on top of something that already
// works without it.
export type ShopGridPagerMode = 'more' | 'pages' | 'scroll'

export type ShopGridPagerProps = {
  // Every card, in order. A prop rather than `children` on purpose: JSX treats a
  // single-element array as one child and refuses to type it as a list, and the
  // cards genuinely are a list this has to slice.
  cards: ReactNode[]
  /** How many are on screen at once. */
  perPage: number
  mode: ShopGridPagerMode
  /** Wrapper the visible cards sit in - the grid div the block would have drawn. */
  gridClassName?: string
  gridStyle?: React.CSSProperties
  /** Wording, so a shop can say "Show more chairs" if it likes. */
  moreLabel?: string
  /** Printed above the pager: "Showing 24 of 217". Blank to leave it out. */
  countTemplate?: string
  /** How many products the grid holds altogether. Only differs from
   *  `cards.length` when the server rendered a window of them and left the rest
   *  to `loadMore`; absent, it IS cards.length, which is every caller that
   *  predates on-demand paging. */
  total?: number
  /** Fetches the cards for a window of the grid, rendered on the server. A
   *  server function handed down as a prop rather than imported: a client file
   *  that imports its way to the database fails the build-time graph check, and
   *  a reference passed across the RSC boundary is not an import.
   *
   *  Absent means every card is already here - the original behaviour. */
  loadMore?: ShopGridCardLoader
  /** Which page the SERVER rendered, from `?page=` on the address. 1 unless a
   *  crawler or a shared link asked for another. Only meaningful beside
   *  `loadMore` - with every card already on the page there is nothing to page
   *  to, and every product is linked from page one anyway. */
  page?: number
}

/** The one contiguous run of missing cards inside [from, to), or null when the
 *  window is already complete. One run rather than several because a grid is
 *  only ever filled front-to-back or a page at a time, so a hole is always a
 *  block - and asking for one span is one round trip instead of several.
 *
 *  Pure and exported so the fetch arithmetic is testable without a DOM or a
 *  server, which matters here: getting it wrong shows up as a grid that quietly
 *  stops growing, and that is precisely the kind of bug that reaches a customer. */
export function missingSpan(
  slots: readonly unknown[],
  from: number,
  to: number,
): { offset: number; count: number } | null {
  let first = -1
  let last = -1
  for (let i = Math.max(0, from); i < Math.min(to, slots.length); i++) {
    if (slots[i] !== undefined) continue
    if (first === -1) first = i
    last = i
  }
  if (first === -1) return null
  return { offset: first, count: last - first + 1 }
}

/** Which slice of the card list is on screen, as [start, end) indices. Pure and
 *  exported so the windowing is testable without a DOM - see the sibling test. */
export function visibleRange(
  mode: ShopGridPagerMode,
  state: { shown: number; page: number; size: number; total: number },
): [number, number] {
  const size = Math.max(1, Math.floor(state.size) || 1)
  // 'scroll' and 'more' share one window - they differ only in what grows it.
  //
  // It starts at `page` rather than always at the top, which is what lets a
  // crawler's ?page=3 and a shared link to it show products 25-36 instead of
  // silently starting over at 1. Page one is a start of 0, i.e. exactly what
  // this did before the parameter existed.
  if (mode === 'more' || mode === 'scroll') {
    const start = (Math.max(1, Math.floor(state.page) || 1) - 1) * size
    return [Math.min(start, state.total), Math.min(Math.max(start + size, state.shown), state.total)]
  }
  const last = Math.max(1, Math.ceil(state.total / size))
  const page = Math.min(Math.max(1, state.page), last)
  const start = (page - 1) * size
  return [start, Math.min(start + size, state.total)]
}

export function pageNumbers(current: number, last: number): (number | '…')[] {
  // First, last, and a window either side of where the shopper is. Anything
  // else on a 30-page category is a wall of numbers nobody reads.
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const from = Math.max(2, current - 1)
  const to = Math.min(last - 1, current + 1)
  if (from > 2) out.push('…')
  for (let n = from; n <= to; n++) out.push(n)
  if (to < last - 1) out.push('…')
  out.push(last)
  return out
}

const pagerCss = `
.shop-pager{display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:28px}
.shop-pager-count{font-size:13px;color:var(--color-text-muted)}
.shop-pager-status{font-size:13px;color:var(--color-text-muted);margin:0}
.shop-pager-retry{appearance:none;background:none;border:0;padding:0;font:inherit;color:var(--color-primary);text-decoration:underline;cursor:pointer}
.shop-pager-retry:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.shop-pager-more{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;min-height:44px;padding:0 26px;border:1px solid var(--color-border);border-radius:9999px;background:var(--color-surface);color:var(--color-fg);font:inherit;font-weight:600;font-size:15px;cursor:pointer;transition:background .12s ease}
.shop-pager-more:hover{background:var(--color-bg-subtle)}
.shop-pager-more:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.shop-pager-prev{font-size:14px;color:var(--color-text-muted);text-decoration:underline}
.shop-pager-prev:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.shop-pager-pages{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;list-style:none;margin:0;padding:0}
.shop-pager-pages button{min-width:44px;min-height:44px;padding:0 10px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-surface);color:var(--color-fg);font:inherit;font-size:14px;cursor:pointer}
.shop-pager-pages button:hover:not(:disabled){background:var(--color-bg-subtle)}
.shop-pager-pages button:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.shop-pager-pages button[aria-current="page"]{background:var(--color-primary);color:var(--color-on-primary);border-color:var(--color-primary);font-weight:600}
.shop-pager-pages button:disabled{opacity:.45;cursor:not-allowed}
.shop-pager-gap{display:flex;align-items:flex-end;min-width:20px;justify-content:center;color:var(--color-text-muted);font-size:14px}
`

export function ShopGridPager({
  cards,
  perPage,
  mode,
  gridClassName,
  gridStyle,
  moreLabel,
  countTemplate,
  total: totalProp,
  loadMore,
  page: serverPage,
}: ShopGridPagerProps) {
  const total = Math.max(cards.length, Math.floor(Number(totalProp)) || 0)
  const size = Math.max(1, Math.floor(perPage) || 1)
  const lastPage = Math.max(1, Math.ceil(total / size))
  const startPage = Math.min(Math.max(1, Math.floor(Number(serverPage)) || 1), lastPage)
  // 'more' grows a window from the top; 'pages' moves a window of fixed size.
  // Both open on whichever page the server rendered.
  const [shown, setShown] = useState(startPage * size)
  const [page, setPage] = useState(startPage)
  const countId = useId()

  // One slot per product, the server's cards already in theirs. `undefined` is
  // "not fetched yet" and only ever occurs when `loadMore` was handed over.
  //
  // Seeded at the OFFSET the server rendered from, not at zero: on ?page=3 those
  // cards are products 25-36, and dropping them in at 1-12 would show the right
  // products in the wrong places and then fetch them all over again.
  const [slots, setSlots] = useState<(ReactNode | undefined)[]>(() => {
    const seeded: (ReactNode | undefined)[] = Array.from({ length: total }, () => undefined)
    const offset = (startPage - 1) * size
    cards.forEach((card, i) => { seeded[offset + i] = card })
    return seeded
  })
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  // Bumped by the retry button. The fetch effect keys off the window and what is
  // already in hand, neither of which a failure changes - so without this a
  // second press would ask nothing of anybody.
  const [retryNonce, setRetryNonce] = useState(0)
  // Which span is in flight, so a scroll observer firing four times in one
  // second asks once. A ref rather than state: it must be true the instant the
  // effect decides to fetch, not on the next render.
  const inFlight = useRef<string | null>(null)

  const [from, to] = useMemo(
    () => visibleRange(mode, { shown, page, size, total }),
    [mode, page, shown, size, total],
  )

  // Fetch whatever the current window is missing. Runs on every window change,
  // which is exactly right: a click on page 9 needs page 9's cards as much as a
  // scroll to the bottom needs the next twenty-four.
  useEffect(() => {
    if (!loadMore) return
    const span = missingSpan(slots, from, to)
    if (!span) return
    const key = `${span.offset}:${span.count}`
    if (inFlight.current === key) return
    inFlight.current = key
    setLoading(true)
    setFailed(false)
    // Deliberately NOT cancelled when the window moves on. The slots are fixed
    // positions in the grid, so a batch that arrives after the shopper has
    // clicked elsewhere still belongs exactly where it was going - and throwing
    // it away while the in-flight guard refuses to ask for the same span again
    // leaves that part of the grid permanently empty.
    loadMore({ offset: span.offset, count: span.count })
      .then((fetched) => {
        setSlots((prev) => {
          const next = [...prev]
          fetched.forEach((card, i) => { next[span.offset + i] = card })
          // Anything in the span the server did not send back is marked ANSWERED
          // rather than left empty. `false` renders nothing and is not
          // `undefined`, so missingSpan stops seeing a hole there.
          //
          // Without this a span that legitimately comes back short - a product
          // unpublished between the page loading and the shopper scrolling to it
          // - is a hole the next render asks for again, and again, forever. The
          // effect re-runs on every change to `slots`, which is exactly what
          // makes a short answer self-draining and an empty one a spin.
          for (let i = fetched.length; i < span.count; i++) {
            if (next[span.offset + i] === undefined) next[span.offset + i] = false
          }
          return next
        })
      })
      // Loudly enough to be recoverable, quietly enough not to be a crash: the
      // retry line appears and the shopper presses it. Swallowing this would
      // leave a grid that has simply stopped growing.
      .catch(() => setFailed(true))
      .finally(() => {
        // Only if it is still ours - a later span may have claimed the slot.
        if (inFlight.current === key) inFlight.current = null
        setLoading(false)
      })
    // retryNonce is in the list on purpose and read nowhere: it is how the retry
    // button asks again for a window that has not otherwise changed.
  }, [loadMore, slots, from, to, retryNonce])

  const visible = useMemo(
    () => slots.slice(from, to).filter((card): card is ReactNode => card !== undefined),
    [slots, from, to],
  )

  // One way to grow the window, whether a thumb or an observer asked for it.
  const growing = mode === 'more' || mode === 'scroll'
  const showMore = useCallback(() => {
    setShown((n) => Math.min(n + size, total))
  }, [size, total])

  // The server renders `?page=N` on its own, because a block has no idea what
  // address it is being served at. Once mounted we know, so the hrefs are rebuilt
  // against the real query string - which is what keeps a shopper's ticked
  // filters on the link they see in the status bar, and on a middle-click.
  const [query, setQuery] = useState('')
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the query string is only readable post-mount, and reading it during render would mismatch the server's markup on hydration
    setQuery(window.location.search)
  }, [])
  const nextPage = Math.min(lastPage, Math.floor(to / size) + 1)
  const hrefNext = pageHref(query, nextPage)
  const hrefPrev = pageHref(query, Math.max(1, startPage - 1))

  // A real link, intercepted. Modifier clicks, middle clicks and "open in new
  // tab" are deliberately NOT intercepted: the address is genuine and a shopper
  // asking for it in a new tab should get it.
  const takeOverClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, run: () => void) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    run()
  }, [])

  const sentinelRef = useRef<HTMLDivElement>(null)
  const moreToShow = growing && shown < total
  useEffect(() => {
    if (mode !== 'scroll' || !moreToShow) return
    const node = sentinelRef.current
    // No sentinel, or a browser without the observer, leaves the button doing
    // the whole job - which it can, because it never went away.
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) showMore()
      },
      // Start loading before the shopper actually reaches the end, so the next
      // row is usually there by the time they get to where it goes.
      { rootMargin: '400px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [mode, moreToShow, showMore])

  const upTo = to
  const countText = countTemplate
    ? countTemplate.replace('{shown}', String(upTo)).replace('{total}', String(total))
    : ''

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: pagerCss }} />
      <div className={gridClassName} style={gridStyle}>
        {visible}
      </div>
      {total > size && (
        <nav className="shop-pager" aria-label="Product pages" aria-busy={loading || undefined}>
          {countText && (
            // Polite, not assertive: the shopper asked for more products, so the
            // new count is a confirmation rather than an interruption.
            <p className="shop-pager-count" id={countId} aria-live="polite">
              {countText}
            </p>
          )}
          {failed && (
            // A grid that has simply stopped growing looks like a grid that has
            // run out of products, so say what happened and offer the way back.
            // Rendered for numbered pages too, where there is no "Show more"
            // button to carry the retry and an empty page otherwise says nothing.
            <p className="shop-pager-status" role="status">
              Those didn&rsquo;t load.{' '}
              <button type="button" className="shop-pager-retry" onClick={() => setRetryNonce((n) => n + 1)}>
                Try again
              </button>
            </p>
          )}
          {/* Only ever rendered past page one, and only for a growing shelf -
              numbered pages have their own way back. Without it a crawler (or a
              shopper with a shared link) can walk forward through the shelf and
              never back, which reads as a chain of orphans. */}
          {growing && startPage > 1 && (
            <a className="shop-pager-prev" href={hrefPrev} rel="prev">
              &lsaquo; Previous
            </a>
          )}
          {growing ? (
            moreToShow && (
              <>
                {/* An anchor, not a button, and that is the whole trick. A
                    shopper's click is intercepted and the next products arrive in
                    place - infinite scroll, unchanged. A crawler has no
                    JavaScript to intercept anything, so it sees a plain link to
                    the next page and follows it, and the one after that, until
                    the shelf runs out. Every product stays reachable from the
                    shelf it belongs to without a shopper ever seeing a page
                    boundary. */}
                <a
                  className="shop-pager-more"
                  href={hrefNext}
                  onClick={(e) => takeOverClick(e, showMore)}
                  aria-describedby={countText ? countId : undefined}
                  // Not disabled while a page is on its way: disabling moves the
                  // focus ring off the control the shopper is standing on, and
                  // pressing it again is a reasonable thing to want - it grows
                  // the window further, which asks for the next span too.
                  aria-busy={loading || undefined}
                >
                  {moreLabel || 'Show more'}
                </a>
                {/* What the observer watches. Empty, unfocusable and invisible
                    to assistive tech - it is a scroll position, not content. */}
                {mode === 'scroll' && <div ref={sentinelRef} aria-hidden="true" style={{ width: '100%', height: 1 }} />}
              </>
            )
          ) : (
            <ul className="shop-pager-pages">
              <li>
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Previous page">
                  ‹
                </button>
              </li>
              {pageNumbers(page, lastPage).map((n, i) =>
                n === '…' ? (
                  <li key={`gap-${i}`} className="shop-pager-gap" aria-hidden="true">
                    …
                  </li>
                ) : (
                  <li key={n}>
                    <button
                      type="button"
                      onClick={() => setPage(n)}
                      aria-current={n === page ? 'page' : undefined}
                      aria-label={`Page ${n}`}
                    >
                      {n}
                    </button>
                  </li>
                ),
              )}
              <li>
                <button type="button" onClick={() => setPage((p) => Math.min(lastPage, p + 1))} disabled={page === lastPage} aria-label="Next page">
                  ›
                </button>
              </li>
            </ul>
          )}
        </nav>
      )}
    </>
  )
}
