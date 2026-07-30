'use client'

// Publishes the pinned section strip's measured height on :root as
// `--spd-tabnav-h`, for everything that has to sit clear of a strip pinned below
// the site header: the sticky gallery column's `top` and height budget, and the
// title's / sections' `scroll-margin-top` (galleryCss and tabsCss in
// components/puck/parts/detail-parts.tsx).
//
// Two different blocks can be that strip, which is why this is a component of
// its own rather than an effect inside either of them:
//   - Product: Tabs, whose sticky lives on the `.spd-tab-shell` wrapper so the
//     fade/arrow overlay pins with the strip.
//   - Product: Section links, sticky on the nav itself and rendered entirely on
//     the server, so it has no effect to put this in.
//
// It measures by SELECTOR rather than by ref for the same reason: a page may
// carry both blocks, so two of these can be mounted at once, and a query-based
// reading has them publish the same number instead of each overwriting the other
// with its own strip's height. The refcount is only so the last one to unmount is
// the one that clears the property.

import { useEffect } from 'react'

// The Tabs island moves sticky UP to the shell and leaves its own nav unpinned,
// so these two selectors never count the same strip twice.
const PINNED = '.spd-tab-shell.sticky, .spd-tab-nav.sticky'

let mounted = 0

// The tallest pinned strip, not the sum: both blocks pin at the same
// `top:var(--spd-header-h)`, so two of them overlap rather than stack.
// 0 when nothing is pinned, which is what keeps a non-sticky page unaffected.
function pinnedHeight(): number {
  let tallest = 0
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(PINNED))) {
    tallest = Math.max(tallest, el.offsetHeight)
  }
  return Math.round(tallest)
}

// `signal` re-runs the measurement when the strip's own markup changes rather
// than merely its size - the editor toggling `sticky` off and on swaps which
// elements the selector matches at all, and a ResizeObserver bound to the old set
// has nothing to say about that. Static callers can leave it out.
export function StickyStripHeight({ signal }: { signal?: string } = {}) {
  useEffect(() => {
    const root = document.documentElement
    mounted += 1
    const publish = () => root.style.setProperty('--spd-tabnav-h', `${pinnedHeight()}px`)
    publish()

    // The strip is not a fixed height: it wraps taller when narrow, its vertical
    // padding is a per-block setting, and the tab count changes under the editor
    // without remounting this. Observing the strips themselves catches all three.
    const ro = new ResizeObserver(publish)
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(PINNED))) ro.observe(el)
    window.addEventListener('resize', publish)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', publish)
      mounted -= 1
      if (mounted === 0) root.style.removeProperty('--spd-tabnav-h')
    }
  }, [signal])
  return null
}
