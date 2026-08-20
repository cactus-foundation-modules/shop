'use client'

// A category's long description, folded down to a few lines on a phone with a
// "Read more" to open it. Desktop and tablet are untouched - the whole thing
// prints as it always has, and the toggle is not rendered at those widths.
//
// Why: the description sits between the heading and the products, and a couple
// of well-written paragraphs that cost three lines on a desktop run to fourteen
// on a 390px screen. On the office desks category that put the first product
// past the second screenful - a shopper on a phone arrived at a shop and saw no
// stock. Folded, the same copy costs four lines and the products are up where
// someone can see them, with the full text one tap away for the people (and the
// crawlers, which get the whole thing in the markup either way) who want it.
//
// Progressive enhancement, in both directions:
// - The fold is server-rendered, so the first paint on a phone is already the
//   short version. Clamping after hydration instead would show the long one and
//   then yank the products up the screen.
// - With JavaScript off the button could never open it, so <noscript> takes the
//   fold back off. Nobody is left holding a clamp they cannot release.
//
// The clamp and the button are both driven by the media query in the stylesheet
// below, so the breakpoint lives in exactly one place and JavaScript never has
// to measure the viewport.

import { useEffect, useId, useRef, useState } from 'react'
import type { Breakpoints } from '@/modules/shop/lib/breakpoints-shared'

// How much shows before the fold. Lines rather than a pixel height so it scales
// with the reader's own font size.
const CLAMP_LINES = 4

function clampCss(mobileBp: string): string {
  return `
.shop-cat-desc-toggle { display: none; }
@media (max-width: ${mobileBp}) {
  .shop-cat-desc-fold[data-folded='true'] {
    /* The columns have to come off before the clamp will take. A multi-column
       container is blockified whatever display asks for, so -webkit-box is
       quietly ignored and the fold does nothing at all - it still measured the
       full fourteen lines with the line-clamp sitting there computed and
       useless. Marked important because the caller sets the column rules
       inline (see foldStyle) and nothing else can outrank that. At these
       widths a 26rem measure only ever resolved to one column anyway, so
       nothing is lost. */
    columns: auto !important;
    column-width: auto !important;
    display: -webkit-box;
    -webkit-line-clamp: ${CLAMP_LINES};
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .shop-cat-desc-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.5rem;
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-primary);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  .shop-cat-desc-toggle:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
    border-radius: 2px;
  }
}
/* A description short enough to fit inside the fold has nothing behind it, so
   the toggle goes rather than sitting there promising more and doing nothing
   when tapped. Outside the media query and higher specificity than the rule
   that shows it, so it wins at every width. */
.shop-cat-desc-toggle[data-needed='false'] { display: none; }
`
}

// Without scripting the button is inert, so the fold has to come off entirely -
// otherwise a reader with JavaScript disabled is left with four lines and no way
// to see the rest.
const NOSCRIPT_CSS = `
.shop-cat-desc-fold[data-folded='true'] { -webkit-line-clamp: none; overflow: visible; }
.shop-cat-desc-toggle { display: none !important; }
`

// Whether the folded text is actually taller than the fold. Assumed true, which
// is what the server renders and what every real description does; the measure
// below only ever takes the toggle away, so the common case never moves.
function useOverflows(foldRef: React.RefObject<HTMLDivElement | null>, open: boolean): boolean {
  const [overflows, setOverflows] = useState(true)

  useEffect(() => {
    // Only measurable while folded. Open, the clamp is off and scrollHeight
    // equals clientHeight by definition - measuring then would decide the text
    // fits and take away the "Show less" that puts it back.
    if (open) return
    const el = foldRef.current
    if (!el) return
    // Re-measured on resize as well as on mount: the fold only exists below the
    // mobile breakpoint, so crossing it - or turning a phone sideways - changes
    // the answer. The 1px allows for sub-pixel line heights.
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [foldRef, open])

  return overflows
}

export function ShopCategoryDescriptionClamp({ breakpoints, foldStyle, children }: {
  breakpoints: Breakpoints
  // Layout for the folded element itself (the caller's multi-column rules). It
  // has to live ON the clamped box rather than a wrapper around it: the clamp
  // turns this element into a -webkit-box, and a column container in between
  // would be the thing being clamped instead of the text. Harmless at phone
  // widths, where a 26rem column measure only ever resolves to one column
  // anyway, so the fold never has to fight it.
  foldStyle?: React.CSSProperties
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const foldRef = useRef<HTMLDivElement>(null)
  const overflows = useOverflows(foldRef, open)

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: clampCss(breakpoints.mobileBp) }} />
      <noscript><style dangerouslySetInnerHTML={{ __html: NOSCRIPT_CSS }} /></noscript>
      <div className="shop-cat-desc-fold" data-folded={open ? 'false' : 'true'} id={bodyId} style={foldStyle} ref={foldRef}>
        {children}
      </div>
      <button
        type="button"
        className="shop-cat-desc-toggle"
        data-needed={overflows ? 'true' : 'false'}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Show less' : 'Read more'}
      </button>
    </>
  )
}
