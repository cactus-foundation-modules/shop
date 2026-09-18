import { afterEach, describe, expect, it, vi } from 'vitest'
import { holdScrollPosition, releaseScrollHold, ScrollHoldSnapshot, type HeldScroll } from '@/modules/shop/lib/hold-scroll-position'

// The grid growing under a shopper who has scrolled to the end of it. The
// browser's own anchoring is stood in for by an update that moves the page, which
// is what it amounts to from here: the position reads differently afterwards.
//
// The nudge is pinned as tightly as the restore. It is the part that works in
// Chrome, where the restore alone was shipped and did nothing, and it is exactly
// the kind of line a tidy-up would remove as a no-op.

type FakeWindow = { scrollX: number; scrollY: number; scrollTo: ReturnType<typeof vi.fn> }

function fakeWindow(scrollY: number): FakeWindow {
  const win: FakeWindow = { scrollX: 0, scrollY, scrollTo: vi.fn() }
  vi.stubGlobal('window', win)
  return win
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('holdScrollPosition', () => {
  it('puts the page back when the new cards carried it down, then nudges', () => {
    const win = fakeWindow(1800)
    holdScrollPosition(() => { win.scrollY = 4200 })
    expect(win.scrollTo.mock.calls).toEqual([
      [{ top: 1800, left: 0, behavior: 'instant' }],
      [{ top: 1799, left: 0, behavior: 'instant' }],
      [{ top: 1800, left: 0, behavior: 'instant' }],
    ])
  })

  it('still nudges when the page did not move yet - that is the Chrome case', () => {
    const win = fakeWindow(1800)
    const update = vi.fn()
    holdScrollPosition(update)
    expect(update).toHaveBeenCalledOnce()
    expect(win.scrollTo.mock.calls).toEqual([
      [{ top: 1799, left: 0, behavior: 'instant' }],
      [{ top: 1800, left: 0, behavior: 'instant' }],
    ])
  })

  it('ends where it started, whatever it did in between', () => {
    const win = fakeWindow(640)
    holdScrollPosition(() => { win.scrollY = 900 })
    const last = win.scrollTo.mock.calls.at(-1)?.[0] as { top: number }
    expect(last.top).toBe(640)
  })

  it('leaves a page at the very top alone', () => {
    const win = fakeWindow(0)
    holdScrollPosition(() => {})
    expect(win.scrollTo).not.toHaveBeenCalled()
  })

  it('still applies the update where there is no window', () => {
    const update = vi.fn()
    holdScrollPosition(update)
    expect(update).toHaveBeenCalledOnce()
  })
})

// A fetched batch is committed by React whenever its cards can render, not when
// the promise resolved, so the position is noted by a lifecycle and put back by
// an effect. Driven by hand here: what matters is what each half does to the
// page, and React calling them in the right order is React's promise, not ours.
describe('ScrollHoldSnapshot and releaseScrollHold', () => {
  function commit(into: { current: HeldScroll | null }, before: unknown, after: unknown, mutate: () => void) {
    const snapshot = new ScrollHoldSnapshot({ token: after, into })
    const held = snapshot.getSnapshotBeforeUpdate({ token: before, into })
    mutate()
    snapshot.componentDidUpdate({ token: before, into }, null, held)
  }

  it('puts the page back after a commit that moved it, then nudges', () => {
    const win = fakeWindow(1800)
    const into: { current: HeldScroll | null } = { current: null }
    commit(into, 'a', 'b', () => { win.scrollY = 4200 })
    expect(into.current).toEqual({ top: 1800, left: 0 })
    releaseScrollHold(into)
    expect(win.scrollTo.mock.calls).toEqual([
      [{ top: 1800, left: 0, behavior: 'instant' }],
      [{ top: 1799, left: 0, behavior: 'instant' }],
      [{ top: 1800, left: 0, behavior: 'instant' }],
    ])
    expect(into.current).toBeNull()
  })

  it('notes the position BEFORE the commit, not after it', () => {
    const win = fakeWindow(1800)
    const into: { current: HeldScroll | null } = { current: null }
    commit(into, 'a', 'b', () => { win.scrollY = 7610 })
    expect(into.current?.top).toBe(1800)
  })

  it('does nothing for a commit that did not change the token', () => {
    const win = fakeWindow(1800)
    const into: { current: HeldScroll | null } = { current: null }
    commit(into, 'a', 'a', () => {})
    releaseScrollHold(into)
    expect(into.current).toBeNull()
    expect(win.scrollTo).not.toHaveBeenCalled()
  })

  it('is safe to release with nothing held', () => {
    const win = fakeWindow(1800)
    releaseScrollHold({ current: null })
    expect(win.scrollTo).not.toHaveBeenCalled()
  })
})
