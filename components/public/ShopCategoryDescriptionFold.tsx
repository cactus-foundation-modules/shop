'use client'

// A category's or collection's long description, folded away behind a "Read
// more" that sits at the end of the blurb under the heading, at every width -
// phone, tablet and desktop alike.
//
// Why: the page already opens with the short blurb in the header, which is the
// line a shopper actually reads. The long description underneath is for the
// people (and the crawlers) who want the detail, and printing all of it above
// the products pushed the first product down the page on a phone and left a
// wall of prose between the heading and the stock on a desktop. Folded, the
// page reads blurb, products - with the detail one click away on the end of the
// blurb's own last line.
//
// Why the link is not simply rendered here: the blurb belongs to the header
// block and the description to this one, two separate blocks with no shared
// parent, and a link that reads as part of a sentence has to be INSIDE that
// sentence's paragraph - no amount of CSS will flow a following block into the
// end of the line above. So the header marks its blurb with `data-shop-blurb`
// and the toggle is portalled into it once the page is live.
//
// Progressive enhancement, in both directions:
// - The fold is server-rendered, so the first paint is already the short
//   version. Folding after hydration would print the whole thing and then yank
//   the products up the screen.
// - Nothing renders the toggle on the server, because before the portal has a
//   home there is nowhere honest to put it: rendered here it would flash into
//   view under the heading and then hop up a line. It arrives on mount instead.
// - With JavaScript off there is no toggle at all, so <noscript> takes the fold
//   back off. Nobody is left holding a fold they cannot release.
//
// The text is in the markup either way - `hidden` hides it from the reader, not
// from the page source.

import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'

/** The attribute a header block puts on its blurb paragraph. */
export const BLURB_ATTR = 'data-shop-blurb'

// What the block keeps above itself when the toggle has gone to live in the
// blurb and the fold is shut: nothing at all. `display: contents` takes the box
// out of the layout rather than leaving an empty one with the description's
// margin still on it, which would print a band of white between the blurb and
// whatever comes next.
const GONE: React.CSSProperties = { display: 'contents' }

// And when there is no blurb to move into, the toggle stays in this block, which
// is then a single link carrying the spacing measured for a whole description.
// Enough to sit clear of the line above, and nothing like the gap prose wants.
const FOLDED_MARGIN_TOP = '0.25rem'

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
  /* Two words, at the end of a paragraph that has just wrapped: keep them on
     the same line as each other. */
  white-space: nowrap;
}
.shop-cat-desc-toggle:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: 2px;
}
`

// Without scripting there is no toggle at all, so the fold has to come off
// entirely - otherwise a reader with JavaScript disabled never sees the
// description. `!important` because `[hidden] { display: none }` is a UA rule
// and the element keeps its `hidden` attribute in the folded server render.
const NOSCRIPT_CSS = `
.shop-cat-desc-fold[hidden] { display: block !important; }
`

export function ShopCategoryDescriptionFold({ className, style, foldStyle, paragraphStyle, paragraphs }: {
  // The block's own wrapper, so the fold can take itself out of the layout
  // while it is shut - see GONE.
  className?: string
  style?: React.CSSProperties
  /** Layout for the folded element itself (the caller's multi-column rules). */
  foldStyle?: React.CSSProperties
  /** Each paragraph of the description. */
  paragraphStyle?: React.CSSProperties
  paragraphs: string[]
}) {
  const [open, setOpen] = useState(false)
  // `undefined` while we have not looked yet, `null` once we have looked and
  // found no blurb to live in. The three states are the point: rendering the
  // toggle before the search would put it in the wrong place first.
  const [blurb, setBlurb] = useState<HTMLElement | null | undefined>(undefined)
  const bodyId = useId()

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the blurb is another block's DOM; it only exists post-mount, and looking for it during render would break hydration
    setBlurb(document.querySelector<HTMLElement>(`p[${BLURB_ATTR}]`))
  }, [])

  if (paragraphs.length === 0) return null

  const toggle = (
    <button
      type="button"
      className="shop-cat-desc-toggle"
      aria-expanded={open}
      aria-controls={bodyId}
      onClick={() => setOpen((v) => !v)}
    >
      {open ? 'Show less' : 'Read more'}
    </button>
  )

  return (
    <div
      className={className}
      // Shut, with the toggle living up in the blurb, this block has nothing on
      // the page and takes no room. Open, it is the description again and wants
      // the spacing the caller measured for it. With no blurb to portal into
      // the toggle stays here, so the block always has something in it.
      style={open ? style : blurb === null ? { ...style, marginTop: FOLDED_MARGIN_TOP } : GONE}
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
        {paragraphs.map((p, i) => <p key={i} style={paragraphStyle}>{p}</p>)}
      </div>
      {blurb === null && toggle}
      {blurb && createPortal(toggle, blurb)}
    </div>
  )
}
