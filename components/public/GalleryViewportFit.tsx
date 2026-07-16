'use client'

// Publishes two measurements on :root for the gallery column's CSS (galleryCss
// in components/puck/parts/detail-parts.tsx) to size the square photo against
// the viewport: `--spd-header-h`, the site header's height, and
// `--spd-thumbs-h`, what the thumbnail strip and its gap cost below the stage.
//
// Both have to be measured rather than known. The header is the core Site Header
// block, whose height is a per-site Puck setting and may be `auto`, whose
// stickiness is another setting, and which a site owner can leave out
// altogether. The old CSS assumed a sticky 96px for everyone, which on a shorter
// header wasted space and on a taller one tucked the top of the stage under the
// nav. The strip's height depends on how many photos wrap onto how many rows.
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

// The gap between stage and strip is the column's own `gap:12px`, so it goes in
// the sum here: without a strip there is no gap either, and the stage gets the
// lot. A `beside` strip sits alongside rather than below and costs the stage no
// height at all, which is why that column overrides the sum in CSS instead.
const COLUMN_GAP = 12

function thumbsHeight(): number {
  const strip = document.querySelector('.spd-stage-col:not(.beside) .spd-thumbs')
  if (!strip) return 0
  return Math.round(strip.getBoundingClientRect().height) + COLUMN_GAP
}

export function GalleryViewportFit() {
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      root.style.setProperty('--spd-header-h', `${stickyHeaderHeight()}px`)
      root.style.setProperty('--spd-thumbs-h', `${thumbsHeight()}px`)
    }
    apply()

    // Both move after first paint more often than it looks: a logo image decodes,
    // a nav wraps to two lines, the window resizes, a condensed-on-scroll header
    // shrinks, or the strip rewraps to a different number of rows.
    const ro = new ResizeObserver(apply)
    for (const el of Array.from(document.querySelectorAll('header'))) ro.observe(el)
    const strip = document.querySelector('.spd-stage-col:not(.beside) .spd-thumbs')
    if (strip) ro.observe(strip)
    window.addEventListener('resize', apply)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', apply)
      root.style.removeProperty('--spd-header-h')
      root.style.removeProperty('--spd-thumbs-h')
    }
  }, [])
  return null
}
