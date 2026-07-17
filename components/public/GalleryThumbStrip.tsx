'use client'

// The thumbnail strip below the stage is one nowrap row that scrolls sideways
// (`.spd-stage-col:not(.beside) .spd-thumbs` in components/puck/parts/detail-parts.tsx),
// and a row that merely overflows says nothing about the eight photos past its
// right edge - the strip just looks like it ends. This wraps it in the same
// affordance the admin tab strip uses: at whichever end still has something
// past it, a fade so the row visibly runs on, and an arrow to walk it along.
//
// A `beside` strip is a column, where left and right mean nothing, so it passes
// straight through and keeps the markup it has always had.

import { Children, useEffect, useRef, useState, type ReactNode } from 'react'

// Roughly two thumbnails and their gaps, so a click moves a useful distance
// without skipping past anything unseen.
const SCROLL_STEP = 160

export function GalleryThumbStrip({
  beside = false,
  className = 'spd-thumbs',
  label = 'Product images',
  children,
}: {
  beside?: boolean
  /** The strip class, so a slot provider's gallery can pass the one it was handed. */
  className?: string
  label?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Both true until the effect has measured, so the first paint (including the
  // server's) carries no arrows rather than arrows that may not be earned.
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

  // The child count rather than the children themselves, because the gallery
  // re-renders on every pointer move across the stage while the magnifier is
  // following it - keying this to `children` would tear the listeners down and
  // put them back on each of those. Thumbnails are added and removed by the
  // count changing, and never resized by a re-render.
  const count = Children.count(children)

  useEffect(() => {
    if (beside) return
    const el = ref.current
    if (!el) return
    const check = () => {
      setAtStart(el.scrollLeft <= 1)
      setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 1)
    }
    check()
    el.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    // The strip's width is the column's, which is itself sized against the
    // viewport by GalleryViewportFit - so what fits changes without the window
    // ever being resized.
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
      ro.disconnect()
    }
  }, [beside, count])

  function step(delta: number) {
    ref.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  if (beside) {
    return (
      <div className={className} role="tablist" aria-label={label}>
        {children}
      </div>
    )
  }

  return (
    <div className="spd-thumbs-wrap">
      <div ref={ref} className={className} role="tablist" aria-label={label}>
        {children}
      </div>
      {!atStart && (
        <>
          <div aria-hidden className="spd-thumbs-fade start" />
          <button
            type="button"
            className="spd-thumbs-arrow start"
            aria-label="Scroll thumbnails left"
            onClick={() => step(-SCROLL_STEP)}
          >
            &lsaquo;
          </button>
        </>
      )}
      {!atEnd && (
        <>
          <div aria-hidden className="spd-thumbs-fade end" />
          <button
            type="button"
            className="spd-thumbs-arrow end"
            aria-label="Scroll thumbnails right"
            onClick={() => step(SCROLL_STEP)}
          >
            &rsaquo;
          </button>
        </>
      )}
    </div>
  )
}
