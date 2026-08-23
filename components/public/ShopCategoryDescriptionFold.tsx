'use client'

// A category's or collection's long description, opened out one paragraph at a
// time: the first paragraph is always on the page, with a "Read more" sitting
// inline at the end of it, and the rest is folded away behind that link at
// every width - phone, tablet and desktop alike.
//
// Why: the page already opens with the short blurb in the header, and printing
// the whole description above the products pushed the first product down the
// page on a phone and left a wall of prose between the heading and the stock on
// a desktop. Folding all of it, though, left the link stranded on a line of its
// own with nothing to read. One paragraph and an inline link is the middle: the
// page reads blurb, opening paragraph, "Read more", products.
//
// The link goes inside the paragraph rather than under it so it lands after the
// last word, the way a "more" link reads in print. A block-level link below the
// text is what this replaced.
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

const FOLD_CSS = `
.shop-cat-desc-toggle {
  display: inline;
  margin-left: 0.4rem;
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
  /* Inside a paragraph the button inherits the pre-line white-space the
     paragraph uses, which would let the label break. Two words; keep them
     together. */
  white-space: nowrap;
}
.shop-cat-desc-toggle:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: 2px;
}
`

// Without scripting the button is inert, so the fold has to come off entirely -
// otherwise a reader with JavaScript disabled never sees the rest of the
// description at all. `!important` because `[hidden] { display: none }` is a UA
// rule and the element keeps its `hidden` attribute in the folded server render.
const NOSCRIPT_CSS = `
.shop-cat-desc-fold[hidden] { display: block !important; }
.shop-cat-desc-toggle { display: none !important; }
`

export function ShopCategoryDescriptionFold({ className, style, foldStyle, leadStyle, paragraphStyle, paragraphs }: {
  className?: string
  style?: React.CSSProperties
  /** Layout for the folded element itself (the caller's multi-column rules). */
  foldStyle?: React.CSSProperties
  /** The always-visible opening paragraph, which sits outside the columns. */
  leadStyle?: React.CSSProperties
  /** Each folded paragraph. */
  paragraphStyle?: React.CSSProperties
  paragraphs: string[]
}) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()

  const [lead, ...rest] = paragraphs
  if (!lead) return null

  return (
    <div className={className} style={style}>
      <style dangerouslySetInnerHTML={{ __html: FOLD_CSS }} />
      <noscript><style dangerouslySetInnerHTML={{ __html: NOSCRIPT_CSS }} /></noscript>
      <p style={leadStyle}>
        {lead}
        {/* A one-paragraph description has nothing behind the link, so it gets
            no link - just the paragraph. */}
        {rest.length > 0 && (
          <button
            type="button"
            className="shop-cat-desc-toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Show less' : 'Read more'}
          </button>
        )}
      </p>
      {rest.length > 0 && (
        // The toggle stays where it is when the fold opens rather than hopping
        // to the bottom of the text: moving it would drop the keyboard focus
        // that just pressed it.
        <div
          className="shop-cat-desc-fold"
          data-folded={open ? 'false' : 'true'}
          id={bodyId}
          hidden={!open}
          style={foldStyle}
        >
          {rest.map((p, i) => <p key={i} style={paragraphStyle}>{p}</p>)}
        </div>
      )}
    </div>
  )
}
