'use client'

// A category's or collection's long description, folded away behind a "Read
// more" at every width - phone, tablet and desktop alike.
//
// Why: the page already opens with the short blurb in the header, which is the
// line a shopper actually reads. The long description underneath is for the
// people (and the crawlers) who want the detail, and printing all of it above
// the products pushed the first product down the page on a phone and left a
// wall of prose between the heading and the stock on a desktop. Folded, the
// page reads blurb, "Read more", products - and the detail is one click away.
//
// Previously this folded only below the mobile breakpoint, and by line-clamping
// rather than by hiding the block outright. Both are gone: the fold is the same
// at every width, so there is no breakpoint to pass in and nothing to measure.
//
// Progressive enhancement, in both directions:
// - The fold is server-rendered, so the first paint is already the short
//   version. Folding after hydration would print the whole thing and then yank
//   the products up the screen.
// - With JavaScript off the button could never open it, so <noscript> takes the
//   fold back off. Nobody is left holding a fold they cannot release.
//
// The text is in the markup either way - `hidden` hides it from the reader, not
// from the page source.

import { useId, useState } from 'react'

// What the block keeps above itself while it is folded. Enough to sit clear of
// the line above, and nothing like the gap a whole description wants.
const FOLDED_MARGIN_TOP = '0.25rem'

const FOLD_CSS = `
.shop-cat-desc-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.25rem;
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
`

// Without scripting the button is inert, so the fold has to come off entirely -
// otherwise a reader with JavaScript disabled never sees the description at all.
// `!important` because `[hidden] { display: none }` is a UA rule and the element
// keeps its `hidden` attribute in the folded server render.
const NOSCRIPT_CSS = `
.shop-cat-desc-fold[hidden] { display: block !important; }
.shop-cat-desc-toggle { display: none !important; }
`

export function ShopCategoryDescriptionFold({ className, style, foldStyle, children }: {
  // The block's own wrapper, so the fold can close the gap above itself - see
  // FOLDED_MARGIN_TOP.
  className?: string
  style?: React.CSSProperties
  // Layout for the folded element itself (the caller's multi-column rules).
  foldStyle?: React.CSSProperties
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()

  return (
    <div
      className={className}
      // Folded, the only thing in this block is the "Read more" link, and the
      // caller's margin was measured for a description sitting under the
      // heading's blurb - it leaves the link marooned in a band of white with
      // the blurb a long way above it. The spacing belongs to the description,
      // so it goes when the description does and comes back when it opens.
      style={open ? style : { ...style, marginTop: FOLDED_MARGIN_TOP }}
    >
      <style dangerouslySetInnerHTML={{ __html: FOLD_CSS }} />
      <noscript><style dangerouslySetInnerHTML={{ __html: NOSCRIPT_CSS }} /></noscript>
      <div
        className="shop-cat-desc-fold"
        data-folded={open ? 'false' : 'true'}
        id={bodyId}
        hidden={!open}
        style={foldStyle}
      >
        {children}
      </div>
      <button
        type="button"
        className="shop-cat-desc-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Show less' : 'Read more'}
      </button>
    </div>
  )
}
