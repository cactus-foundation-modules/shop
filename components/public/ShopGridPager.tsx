'use client'

import { useId, useMemo, useState, type ReactNode } from 'react'

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
// for this when the shop owner asks - see the `paginate` prop. A catalogue that
// outgrows that wants a server-paged grid, and that is a different block.

export type ShopGridPagerMode = 'more' | 'pages'

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
}

/** Which slice of the card list is on screen, as [start, end) indices. Pure and
 *  exported so the windowing is testable without a DOM - see the sibling test. */
export function visibleRange(
  mode: ShopGridPagerMode,
  state: { shown: number; page: number; size: number; total: number },
): [number, number] {
  const size = Math.max(1, Math.floor(state.size) || 1)
  if (mode === 'more') return [0, Math.min(Math.max(size, state.shown), state.total)]
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
.shop-pager-more{min-height:44px;padding:0 26px;border:1px solid var(--color-border);border-radius:9999px;background:var(--color-surface);color:var(--color-fg);font:inherit;font-weight:600;font-size:15px;cursor:pointer;transition:background .12s ease}
.shop-pager-more:hover{background:var(--color-bg-subtle)}
.shop-pager-more:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
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
}: ShopGridPagerProps) {
  const total = cards.length
  const size = Math.max(1, Math.floor(perPage) || 1)
  const lastPage = Math.max(1, Math.ceil(total / size))
  // 'more' grows a window from the top; 'pages' moves a window of fixed size.
  const [shown, setShown] = useState(size)
  const [page, setPage] = useState(1)
  const countId = useId()

  const [from, to] = useMemo(
    () => visibleRange(mode, { shown, page, size, total }),
    [mode, page, shown, size, total],
  )
  const visible = useMemo(() => cards.slice(from, to), [cards, from, to])

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
        <nav className="shop-pager" aria-label="Product pages">
          {countText && (
            // Polite, not assertive: the shopper asked for more products, so the
            // new count is a confirmation rather than an interruption.
            <p className="shop-pager-count" id={countId} aria-live="polite">
              {countText}
            </p>
          )}
          {mode === 'more' ? (
            shown < total && (
              <button
                type="button"
                className="shop-pager-more"
                onClick={() => setShown((n) => Math.min(n + size, total))}
                aria-describedby={countText ? countId : undefined}
              >
                {moreLabel || 'Show more'}
              </button>
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
