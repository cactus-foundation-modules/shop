import type { Breakpoints } from '@/modules/shop/lib/breakpoints-shared'

// ---------------------------------------------------------------------------
// Which pills show up front, and which hide behind "more"
// ---------------------------------------------------------------------------

// A category page with thirty sub-categories prints thirty pills, and the
// shopper meets a wall of navigation before a single product. The strip can be
// capped instead: the busiest few up front, the rest still in the HTML (so they
// are crawlable and one click away) but folded away until asked for.
//
// "Busiest" is the rolled-up product count, not the direct one. A sub-category
// that files nothing itself and holds four children with two hundred products
// between them is not empty to a shopper, and ordering on direct counts would
// bury it at the end.

export type PillCategory = { id: string; name: string }

// Sum each category's own products over its whole sub-tree. UNION-style visited
// guard rather than a plain walk, for the same reason the SQL descendant query
// uses UNION: a stray parent cycle in the data would otherwise recurse forever.
export function rollUpProductCounts(
  all: { id: string; parentId: string | null }[],
  direct: Record<string, number>,
): Record<string, number> {
  const children = new Map<string, string[]>()
  for (const c of all) {
    if (!c.parentId) continue
    const list = children.get(c.parentId)
    if (list) list.push(c.id)
    else children.set(c.parentId, [c.id])
  }
  const rolled: Record<string, number> = {}
  for (const c of all) {
    let total = 0
    const seen = new Set<string>()
    const stack = [c.id]
    while (stack.length) {
      const id = stack.pop() as string
      if (seen.has(id)) continue
      seen.add(id)
      total += direct[id] ?? 0
      for (const child of children.get(id) ?? []) stack.push(child)
    }
    rolled[c.id] = total
  }
  return rolled
}

// The strip split in two: what prints up front, and what waits behind the
// toggle. A limit of 0 (or one that covers the lot) is the old behaviour
// exactly - every pill shown, in the shop's own order, no toggle printed.
export function splitPillsByPopularity<T extends PillCategory>(
  categories: T[],
  counts: Record<string, number>,
  limit: number,
): { shown: T[]; hidden: T[] } {
  const cap = Math.floor(Number(limit)) || 0
  if (cap <= 0 || cap >= categories.length) return { shown: categories, hidden: [] }
  const ordered = [...categories].sort((a, b) => {
    const diff = (counts[b.id] ?? 0) - (counts[a.id] ?? 0)
    // Names break the tie so the order is stable rather than however the rows
    // happened to arrive - two categories with the same count must not swap
    // places between renders and make the strip look like it is shuffling.
    return diff !== 0 ? diff : a.name.localeCompare(b.name, 'en-GB')
  })
  return { shown: ordered.slice(0, cap), hidden: ordered.slice(cap) }
}

// The pill strip's stylesheet, in a file with no server imports so both halves
// of the Category Browser block can use it: the RSC render (ShopCategoryPills)
// and the client editor placeholder (ShopCategoryBrowser.tsx) stamp the same
// classes, keeping the editor canvas pixel-identical to the live page.
//
// Tokens only - the pills pick up each site's palette and stay AA in both
// light and dark mode because the text/background pairing is the page's own.
//
// Media queries can't read CSS custom properties, so the site's breakpoints are
// baked in at render time - same approach as the shop's own grids.
export function shopCategoryPillsCss({ mobileBp }: Breakpoints): string {
  return `
.shop-cat-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.shop-cat-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.4rem 0.95rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.875rem;
  line-height: 1.3;
  text-decoration: none;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.shop-cat-pill:hover {
  background: var(--color-bg-subtle);
  border-color: var(--color-text-muted);
}
/* The capped strip: the extra pills are in the HTML on every render, and CSS is
   what folds them away, so a crawler (and a browser with the stylesheet still
   in flight) sees every sub-category link. The toggle is a hidden checkbox
   inside its own label - no JavaScript, which matters on a block that renders
   on the server and has no client half to hydrate.

   All of it sits behind @supports selector(:has(*)): where :has is missing the
   extras are never hidden in the first place and the toggle never prints, so
   that browser gets the plain wrapping strip it has always had rather than a
   dead button and a truncated menu. */
.shop-cat-more {
  display: none;
  cursor: pointer;
  user-select: none;
}
.shop-cat-more-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.shop-cat-more-close { display: none; }
@supports selector(:has(*)) {
  .shop-cat-more { display: inline-flex; }
  .shop-cat-pills-limited .shop-cat-pill-extra { display: none; }
  .shop-cat-pills-limited:has(.shop-cat-more-input:checked) .shop-cat-pill-extra { display: inline-flex; }
  .shop-cat-pills-limited:has(.shop-cat-more-input:checked) .shop-cat-more-open { display: none; }
  .shop-cat-pills-limited:has(.shop-cat-more-input:checked) .shop-cat-more-close { display: inline; }
  /* The checkbox itself is off-screen but still focusable, so the ring has to be
     borrowed onto the pill or keyboard users lose their place entirely. */
  .shop-cat-more:has(.shop-cat-more-input:focus-visible) {
    outline: 2px solid var(--color-text);
    outline-offset: 2px;
  }
}
/* Swipe affordance on the scrolling row, in behaviour the admin tab bar's
   (core's components/admin/TabStrip.tsx): the edge with content past it fades
   out and carries a chevron button, drawn by the client wrapper
   (ShopCategoryPillsScroller) once it has measured the overflow.

   The fade is a MASK on the strip, not a gradient painted over it in a
   background colour. The tab bar can name its background because it only ever
   runs on the admin page; a shop block cannot. It sits wherever the owner drops
   it - a section with its own colour, a tinted band, an image - and the page's
   own --color-page-bg was pure white on a storefront whose pages are warm white,
   so a painted fade showed up as a white rectangle with two visible edges. A
   mask has no colour to get wrong: it fades the pills to transparent and lets
   whatever is behind them come through, in either theme, on any background.
   The chevron sits in the masked-out strip, so it needs no plate of its own. */
.shop-cat-scroller {
  position: relative;
}
.shop-cat-scroller[data-fade-left] .shop-cat-pills {
  -webkit-mask-image: linear-gradient(to right, transparent 0, #000 3.5rem);
  mask-image: linear-gradient(to right, transparent 0, #000 3.5rem);
}
.shop-cat-scroller[data-fade-right] .shop-cat-pills {
  -webkit-mask-image: linear-gradient(to left, transparent 0, #000 3.5rem);
  mask-image: linear-gradient(to left, transparent 0, #000 3.5rem);
}
.shop-cat-scroller[data-fade-left][data-fade-right] .shop-cat-pills {
  -webkit-mask-image: linear-gradient(to right, transparent 0, #000 3.5rem, #000 calc(100% - 3.5rem), transparent 100%);
  mask-image: linear-gradient(to right, transparent 0, #000 3.5rem, #000 calc(100% - 3.5rem), transparent 100%);
}
.shop-cat-arrow {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}
.shop-cat-arrow:hover {
  color: var(--color-text);
}
.shop-cat-arrow-left { left: 0; }
.shop-cat-arrow-right { right: 0; }
/* On a phone the strip is a single scrolling row rather than a wrapping block.
   Wrapped, a handful of sub-category names stack into four or five full-width
   rows of chrome between the heading and the first product - on a category page
   that is the shopper's whole first screen spent on navigation they did not ask
   for. One row costs a fixed 2.5rem however many sub-categories there are, and
   the pill clipped at the right edge is what says there are more. */
@media (max-width: ${mobileBp}) {
  .shop-cat-pills {
    flex-wrap: nowrap;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch;
  }
  .shop-cat-pill {
    flex: none;
    scroll-snap-align: start;
  }
  /* The fades are the affordance now, and a native bar under them just muddles
     the edge - the admin tab bar hides its own for the same reason. */
  .shop-cat-pills {
    scrollbar-width: none;
  }
  .shop-cat-pills::-webkit-scrollbar {
    display: none;
  }
}
`
}
