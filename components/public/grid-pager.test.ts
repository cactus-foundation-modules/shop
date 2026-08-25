import { describe, expect, it } from 'vitest'
import { missingSpan, pageNumbers, visibleRange } from '@/modules/shop/components/public/ShopGridPager'

// The windowing behind the product grid's pager. Worth pinning because the bug
// it exists to fix was silent: a category of 217 products rendered 100 of them
// and said nothing, so an off-by-one here would go the same way - a page that
// looks fine and quietly drops the last few products.

describe('visibleRange - "show more"', () => {
  it('opens on one page', () => {
    expect(visibleRange('more', { shown: 24, page: 1, size: 24, total: 217 })).toEqual([0, 24])
  })

  it('grows from the top, never scrolling past what has been asked for', () => {
    expect(visibleRange('more', { shown: 48, page: 1, size: 24, total: 217 })).toEqual([0, 48])
    expect(visibleRange('more', { shown: 216, page: 1, size: 24, total: 217 })).toEqual([0, 216])
  })

  it('stops at the last product rather than running past it', () => {
    expect(visibleRange('more', { shown: 240, page: 1, size: 24, total: 217 })).toEqual([0, 217])
  })

  it('never shows fewer than one page, whatever state arrives', () => {
    expect(visibleRange('more', { shown: 0, page: 1, size: 24, total: 217 })).toEqual([0, 24])
  })
})

describe('visibleRange - infinite scroll', () => {
  // Scroll and "show more" share one window; only the thing that grows it
  // differs. So every guarantee proved for 'more' has to hold here too.
  it('opens on one page, exactly as "show more" does', () => {
    expect(visibleRange('scroll', { shown: 24, page: 1, size: 24, total: 217 }))
      .toEqual(visibleRange('more', { shown: 24, page: 1, size: 24, total: 217 }))
  })

  it('grows from the top as the shopper scrolls', () => {
    expect(visibleRange('scroll', { shown: 96, page: 1, size: 24, total: 217 })).toEqual([0, 96])
  })

  it('stops at the last product rather than running past it', () => {
    expect(visibleRange('scroll', { shown: 400, page: 1, size: 24, total: 217 })).toEqual([0, 217])
  })

  it('reaches every product eventually', () => {
    const [, to] = visibleRange('scroll', { shown: 217, page: 1, size: 24, total: 217 })
    expect(to).toBe(217)
  })

  it('never shows fewer than one page, whatever state arrives', () => {
    expect(visibleRange('scroll', { shown: 0, page: 1, size: 24, total: 217 })).toEqual([0, 24])
  })
})

describe('visibleRange - numbered pages', () => {
  it('moves a fixed window', () => {
    expect(visibleRange('pages', { shown: 0, page: 1, size: 24, total: 217 })).toEqual([0, 24])
    expect(visibleRange('pages', { shown: 0, page: 2, size: 24, total: 217 })).toEqual([24, 48])
  })

  // 217 / 24 = 9.04 pages, so the last page holds a single product. The whole
  // point of the fix is that this one is reachable.
  it('reaches the remainder on the last page', () => {
    expect(visibleRange('pages', { shown: 0, page: 9, size: 24, total: 217 })).toEqual([192, 216])
    expect(visibleRange('pages', { shown: 0, page: 10, size: 24, total: 217 })).toEqual([216, 217])
  })

  it('every product is reachable across the pages, exactly once', () => {
    const total = 217
    const size = 24
    const seen = new Set<number>()
    for (let page = 1; page <= Math.ceil(total / size); page++) {
      const [from, to] = visibleRange('pages', { shown: 0, page, size, total })
      for (let i = from; i < to; i++) {
        expect(seen.has(i)).toBe(false)
        seen.add(i)
      }
    }
    expect(seen.size).toBe(total)
  })

  it('clamps a page number past the end rather than showing nothing', () => {
    expect(visibleRange('pages', { shown: 0, page: 99, size: 24, total: 217 })).toEqual([216, 217])
  })

  it('survives a size of zero', () => {
    expect(visibleRange('pages', { shown: 0, page: 1, size: 0, total: 5 })).toEqual([0, 1])
  })
})

describe('pageNumbers', () => {
  it('lists every page when there are few enough to read', () => {
    expect(pageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(pageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('keeps the first, the last and a window around where the shopper is', () => {
    expect(pageNumbers(5, 20)).toEqual([1, '…', 4, 5, 6, '…', 20])
  })

  it('does not open with a gap when the window already touches the start', () => {
    expect(pageNumbers(2, 20)).toEqual([1, 2, 3, '…', 20])
  })

  it('does not close with a gap when the window already touches the end', () => {
    expect(pageNumbers(19, 20)).toEqual([1, '…', 18, 19, 20])
  })

  it('never repeats a page number', () => {
    for (let last = 1; last <= 30; last++) {
      for (let current = 1; current <= last; current++) {
        const nums = pageNumbers(current, last).filter((n): n is number => n !== '…')
        expect(new Set(nums).size).toBe(nums.length)
      }
    }
  })
})

describe('missingSpan', () => {
  // What the pager asks the server for. A hole it fails to spot is a grid that
  // stops growing with no error anywhere; a span that overshoots is a round trip
  // spent re-fetching cards already on the page.
  const filled = (n: number) => Array.from({ length: n }, (_, i) => `card${i}`)
  const withHole = (total: number, from: number) =>
    Array.from({ length: total }, (_, i) => (i < from ? `card${i}` : undefined))

  it('asks for nothing when the window is already complete', () => {
    expect(missingSpan(filled(24), 0, 24)).toBeNull()
    expect(missingSpan(withHole(217, 48), 0, 48)).toBeNull()
  })

  it('asks for exactly the run the window is short of', () => {
    expect(missingSpan(withHole(217, 24), 0, 48)).toEqual({ offset: 24, count: 24 })
  })

  it('asks only for what is inside the window, not everything unfetched', () => {
    expect(missingSpan(withHole(217, 24), 24, 48)).toEqual({ offset: 24, count: 24 })
    expect(missingSpan(withHole(217, 24), 96, 120)).toEqual({ offset: 96, count: 24 })
  })

  it('covers a hole with something already fetched sitting inside it', () => {
    // A shopper who jumped to page 5 and then scrolled up leaves gaps either
    // side of what they fetched. One span covering the lot is one round trip;
    // the caller drops what it already has when the answer lands.
    const slots: (string | undefined)[] = withHole(120, 24)
    slots[60] = 'card60'
    expect(missingSpan(slots, 48, 72)).toEqual({ offset: 48, count: 24 })
  })

  it('never asks past the end of the grid', () => {
    expect(missingSpan(withHole(30, 24), 24, 48)).toEqual({ offset: 24, count: 6 })
  })

  it('is null for an empty or backwards window', () => {
    expect(missingSpan(withHole(30, 0), 10, 10)).toBeNull()
    expect(missingSpan(withHole(30, 0), 20, 10)).toBeNull()
  })
})
