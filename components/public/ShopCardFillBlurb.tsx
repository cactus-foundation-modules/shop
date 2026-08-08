'use client'

// The short description in its "fill the spare space" mode (see the Blurb part
// in components/puck/parts/card-parts.tsx). In a grid, every card in a row is
// stretched to the tallest card's height, which leaves the shorter cards with a
// band of dead space at the bottom. This island turns that band into as many
// whole lines of the product's short description as happen to fit, ending with
// an ellipsis where the text runs on - and never a line more, so the
// description cannot make any card taller than the row already was.
//
// How the "never taller" guarantee holds: the wrapper this island sits in
// (rendered by the part, class `shop-card-blurb-fill`) is a `flex:1 1 0;
// min-height:0` item whose only child - this paragraph - is absolutely
// positioned (scoped under `.shop-card` in shopCardCss). Out-of-flow content
// and a zero flex basis mean the wrapper contributes nothing to the card's
// intrinsic height; the row is still sized purely by the cards' pictures,
// names, options and prices. The wrapper then GROWS into whatever slack the
// grid stretch hands the card, and this island measures that slack.
//
// Client, because "how many whole lines fit" is a per-card, per-viewport
// measurement no stylesheet can express: `-webkit-line-clamp` wants a fixed
// number. The paragraph is server-rendered but kept invisible by the same
// scoped CSS until the first measurement lands, so there is no flash of
// overflowing text; with scripts unavailable it simply stays out of sight and
// the card looks exactly as it did before the option existed.
//
// A ResizeObserver on the wrapper re-runs the sum whenever the card's shape
// changes - the viewport crossing a breakpoint (three columns to two), a
// sibling's image arriving late and re-sizing the row, the two-up mobile grid
// shrinking the type via --shop-card-scale - so each breakpoint gets its own
// honest line count rather than one frozen at first paint.
//
// In the card layout editor there is no `.shop-card` ancestor, so the scoped
// rules never apply: the sample paragraph stays a plain in-flow element the
// author can see and drag, and the measurement below is a harmless no-op on it.

import { useLayoutEffect, useRef } from 'react'

export function ShopCardFillBlurb({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null)

  useLayoutEffect(() => {
    const p = ref.current
    const wrap = p?.parentElement
    if (!p || !wrap) return

    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(p).lineHeight)
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) return
      // offsetTop covers both the `top` offset and the paragraph's own top
      // margin, so the breathing gap under the name is paid for before a line
      // is counted, not clipped off the last one.
      const lines = Math.floor((wrap.clientHeight - p.offsetTop) / lineHeight)
      if (lines >= 1) {
        p.style.webkitLineClamp = String(lines)
        p.style.visibility = 'visible'
      } else {
        // Not even one whole line of room (this is the tallest card in the
        // row, or near enough) - show nothing rather than a lone "…".
        p.style.removeProperty('-webkit-line-clamp')
        p.style.visibility = 'hidden'
      }
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  return (
    <p className="shop-card-blurb" ref={ref}>
      {text}
    </p>
  )
}
