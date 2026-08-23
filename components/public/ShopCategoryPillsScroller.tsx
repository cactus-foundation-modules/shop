'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

// On a phone the pill strip is a single row you swipe sideways, and the pill
// clipped at the right edge was the only thing saying so - which nobody reads
// as "there is more this way". This is the admin tab bar's answer (see core's
// components/admin/TabStrip.tsx): measure the overflow, fade the edge that has
// content past it, and put a chevron button there for anyone who would rather
// tap than swipe. The fade itself is a mask in the stylesheet, driven by the
// data attributes set here - the tab bar paints its fade in the page's own
// background colour, which a block that can be dropped on any coloured section
// has no business assuming.
//
// The strip itself stays server-rendered - this wrapper only measures it and
// draws chrome on top, so every sub-category link is still in the HTML with no
// JavaScript involved. Nothing renders until the measurement runs, so the
// server markup and the editor canvas are identical to each other and to the
// first paint: the chevrons appear on hydration, only where they are earned.

const STEP = 160

export function ShopCategoryPillsScroller({ children }: { children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const wrap = wrapRef.current
    const el = wrap?.querySelector<HTMLElement>('.shop-cat-pills')
    if (!wrap || !el) return
    const check = () => {
      setCanScrollLeft(el.scrollLeft > 1)
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1)
    }
    check()
    el.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    // Opening the "more" fold puts several more pills in the row, which makes
    // it wider without changing the box the observer is watching - so the
    // toggle's own change event has to ask for a re-measure as well. It bubbles,
    // hence the listener on the wrapper rather than on the checkbox.
    wrap.addEventListener('change', check)
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
      wrap.removeEventListener('change', check)
      ro.disconnect()
    }
  }, [])

  const scrollBy = useCallback((delta: number) => {
    wrapRef.current?.querySelector<HTMLElement>('.shop-cat-pills')?.scrollBy({ left: delta, behavior: 'smooth' })
  }, [])

  return (
    <div
      ref={wrapRef}
      className="shop-cat-scroller"
      data-fade-left={canScrollLeft ? '' : undefined}
      data-fade-right={canScrollRight ? '' : undefined}
    >
      {children}
      {canScrollLeft && (
        <button type="button" className="shop-cat-arrow shop-cat-arrow-left" aria-label="Scroll sub-categories left" onClick={() => scrollBy(-STEP)}>
          &lsaquo;
        </button>
      )}
      {canScrollRight && (
        <button type="button" className="shop-cat-arrow shop-cat-arrow-right" aria-label="Scroll sub-categories right" onClick={() => scrollBy(STEP)}>
          &rsaquo;
        </button>
      )}
    </div>
  )
}
