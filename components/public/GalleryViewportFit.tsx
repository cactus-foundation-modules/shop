'use client'

// Publishes the site header's height as `--spd-header-h` on :root, for the
// gallery column's sticky offset and height cap (see galleryCss in
// components/puck/parts/detail-parts.tsx).
//
// It has to be measured rather than known: the header is the core Site Header
// block, whose height is a per-site Puck setting and may be `auto`, whose
// stickiness is another setting, and which a site owner can leave out
// altogether. The old CSS assumed a sticky 96px for everyone, which on a
// shorter header wasted space and on a taller one tucked the top of the stage
// under the nav.
//
// Rendered by the Gallery part rather than by ProductGallery, so a slot
// provider's replacement gallery (shop-variations') gets the same treatment -
// it wears our column class, so it inherits the CSS that reads this.

import { useEffect } from 'react'

// Only a header pinned to the top of the viewport takes space away from the
// column; a static one scrolls off and costs nothing. `top` is part of the sum
// because a header parked below an announcement bar sits that much lower.
function stickyHeaderHeight(): number {
  let tallest = 0
  for (const el of Array.from(document.querySelectorAll('header'))) {
    const cs = getComputedStyle(el)
    if (cs.position !== 'sticky' && cs.position !== 'fixed') continue
    const top = parseFloat(cs.top)
    // A sticky element with `top:auto` isn't pinned to anything, and one pinned
    // well down the page isn't in the column's way.
    if (!Number.isFinite(top) || top > 4) continue
    tallest = Math.max(tallest, el.getBoundingClientRect().height + top)
  }
  return Math.round(tallest)
}

export function GalleryViewportFit() {
  useEffect(() => {
    const root = document.documentElement
    const apply = () => root.style.setProperty('--spd-header-h', `${stickyHeaderHeight()}px`)
    apply()

    // The height moves after first paint more often than it looks: a logo image
    // decodes, a nav wraps to two lines, the window resizes, or a condensed-on-
    // scroll header shrinks.
    const ro = new ResizeObserver(apply)
    for (const el of Array.from(document.querySelectorAll('header'))) ro.observe(el)
    window.addEventListener('resize', apply)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', apply)
      root.style.removeProperty('--spd-header-h')
    }
  }, [])
  return null
}
