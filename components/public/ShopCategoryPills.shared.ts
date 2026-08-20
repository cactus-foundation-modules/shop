import type { Breakpoints } from '@/modules/shop/lib/breakpoints-shared'

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
}
`
}
