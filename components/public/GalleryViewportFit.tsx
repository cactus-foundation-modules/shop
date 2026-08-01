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

const STRIP_SELECTOR = '.spd-stage-col:not(.beside) .spd-thumbs'

function thumbsHeight(): number {
  const strip = document.querySelector(STRIP_SELECTOR)
  if (!strip) return 0
  return Math.round(strip.getBoundingClientRect().height) + COLUMN_GAP
}

export function GalleryViewportFit() {
  useEffect(() => {
    const root = document.documentElement
    // The strip we are currently watching, so the observer can follow it when it
    // arrives, is replaced, or goes away again.
    let strip: Element | null = null

    // Measures, then re-points the observer at whichever strip is on the page
    // now. Deliberately not deferred to a frame: a background tab pauses
    // requestAnimationFrame, and a shopper who configures a product in one tab
    // and comes back to another would find the measurement still pending.
    const apply = () => {
      root.style.setProperty('--spd-header-h', `${stickyHeaderHeight()}px`)
      root.style.setProperty('--spd-thumbs-h', `${thumbsHeight()}px`)
      const current = document.querySelector(STRIP_SELECTOR)
      if (current === strip) return
      if (strip) ro.unobserve(strip)
      strip = current
      if (strip) ro.observe(strip)
    }

    // Both move after first paint more often than it looks: a logo image decodes,
    // a nav wraps to two lines, the window resizes, a condensed-on-scroll header
    // shrinks, or the strip rewraps to a different number of rows.
    const ro = new ResizeObserver(apply)
    apply()
    for (const el of Array.from(document.querySelectorAll('header'))) ro.observe(el)

    // The strip is not necessarily on the page when this mounts, and observing
    // "whatever exists right now" quietly assumed it was. On a product with
    // options (shop-variations' gallery) there is nothing to pick between until
    // the shopper has chosen a combination, so the strip is rendered later - the
    // one measurement taken at mount said 0px, no observer was watching anything,
    // and nothing ever measured again. The photo then kept the strip's share of
    // the viewport as well as its own, and the column ran 76px past the bottom of
    // the screen with the thumbnails hanging off the end of it. A window resize
    // was the only thing that put it right, which is why it looked intermittent.
    //
    // Cheap on purpose: the callback only re-measures when the strip element
    // itself has appeared, changed or gone, so an unrelated re-render elsewhere
    // on the page costs one querySelector. Height changes are the
    // ResizeObserver's job, not this one's.
    const mo = new MutationObserver(() => {
      if (document.querySelector(STRIP_SELECTOR) !== strip) apply()
    })
    mo.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', apply)
    return () => {
      mo.disconnect()
      ro.disconnect()
      window.removeEventListener('resize', apply)
      root.style.removeProperty('--spd-header-h')
      root.style.removeProperty('--spd-thumbs-h')
    }
  }, [])
  return null
}
