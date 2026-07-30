'use client'

// Shrink-to-fit for a line of text that must not wrap and must not spill out of
// the box it sits in.
//
// The slide-out basket needs it: a delivery card that has the whole width of a
// cart row on the cart page has ~420px of panel here, and the wording in it is
// the shop owner's and the courier's, not ours - "Arrives by Thursday 14 August"
// beside a service called "Two Man Delivery To Room Of Choice" will be longer
// than the card on some baskets and not on others. Wrapping is not an option (a
// promised date reads as one thing) and neither is a hardcoded font size that is
// small enough for the worst case, so the line is measured against its own box
// and scaled down only as far as it actually has to be.
//
// No CSS can do this: there is no "fit this text to its container" property, and
// a container query knows the box's width but not the text's. Measuring is the
// whole job, so it is measured.
//
// The element being fitted must be the row itself (not the text inside it), must
// be `overflow:hidden` with unwrappable content, and must get its width from its
// parent rather than from its contents - otherwise `scrollWidth` past
// `clientWidth` is not the question "is this line too wide", and the answer
// changes as the font does. Its children should be sized in `em` so they follow
// the font size this sets on the row.

import { useEffect, type RefObject } from 'react'

// How small a row may be scaled. Past this the text is no longer worth reading,
// so the row is marked instead and its stylesheet decides what gives (the panel
// lets the service description ellipsis and keeps the price whole).
const MIN_SCALE = 0.8
// Marker for "still too wide even at the floor". Named on the shop side because
// the fitter is what applies it; what it means is the caller's stylesheet's
// business.
const CLIP_CLASS = 'sfit-clip'
// Sub-pixel slack. Browsers report fractional widths, and a row that is 0.3px
// over is not over.
const SLACK = 0.5

// One row. Returns nothing - it writes an inline font-size (or clears it, when
// the row fits at its natural size, so a row that stops being crowded goes back
// to full size rather than staying shrunk from a previous basket).
function fitRow(el: HTMLElement) {
  // The natural size is read once and remembered on the element: read it again
  // later and it would be whatever the last fit set, and the row would ratchet
  // smaller every time it was measured.
  let base = Number(el.dataset.sfitBase)
  if (!base) {
    el.style.fontSize = ''
    base = parseFloat(getComputedStyle(el).fontSize)
    if (!base) return
    el.dataset.sfitBase = String(base)
  }

  el.style.fontSize = `${base}px`
  el.classList.remove(CLIP_CLASS)
  const avail = el.clientWidth
  // Not laid out yet (a shut panel, a display:none ancestor) - nothing to
  // measure against, and guessing from a zero width would shrink every row to
  // the floor. Leave it at full size; the observer runs this again when it is up.
  if (avail <= 0) return
  const needed = el.scrollWidth
  if (needed <= avail + SLACK) { el.style.fontSize = ''; return }

  // Text width is very nearly proportional to font size, so the first guess is
  // usually the answer; the loop is there for the rounding and for kerning that
  // does not scale linearly.
  const floor = base * MIN_SCALE
  let size = Math.max(floor, (base * avail) / needed)
  el.style.fontSize = `${size}px`
  while (size > floor && el.scrollWidth > el.clientWidth + SLACK) {
    size = Math.max(floor, size - 0.5)
    el.style.fontSize = `${size}px`
  }
  if (el.scrollWidth > el.clientWidth + SLACK) el.classList.add(CLIP_CLASS)
}

export function fitLines(root: HTMLElement, selector: string) {
  root.querySelectorAll<HTMLElement>(selector).forEach(fitRow)
}

// Keeps every matching row inside `ref` fitted: on mount, whenever `revision`
// changes (a line added, a service switched - anything that changes the wording),
// once the webfont has actually loaded (the fallback font measures differently,
// so a fit done before the swap is a fit to the wrong text), and whenever the
// box's own width changes.
export function useFitLines(
  ref: RefObject<HTMLElement | null>,
  selector: string,
  revision: string,
) {
  useEffect(() => {
    const root = ref.current
    if (!root) return
    let frame = 0
    // Deferred a frame so the fit measures the DOM React has just committed
    // rather than the one it is replacing.
    const run = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => fitLines(root, selector))
    }
    run()
    // Width only. Fitting a row changes the panel's height, which would
    // otherwise call this straight back - harmless (the fit is idempotent) but
    // pointless work on every basket change.
    let lastWidth = root.clientWidth
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      if (Math.abs(width - lastWidth) < 1) return
      lastWidth = width
      run()
    })
    observer.observe(root)
    let cancelled = false
    document.fonts?.ready.then(() => { if (!cancelled) run() }).catch(() => {})
    return () => { cancelled = true; cancelAnimationFrame(frame); observer.disconnect() }
  }, [ref, selector, revision])
}
