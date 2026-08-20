// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { watchFoldSize } from '@/modules/shop/components/public/ShopCategoryDescriptionClamp'

// The fold decides whether to show its Read more by measuring, and the first
// measurement can easily be taken at a width where nothing is clamped - a page
// loaded on a desktop and then dragged narrower, or a tablet rotated. Something
// has to say "measure again", and it cannot be ResizeObserver alone: some
// embedded browsers ship it as a no-op that never fires, not even the initial
// callback the spec guarantees, which leaves the fold stuck on whatever it
// decided first.

const original = globalThis.ResizeObserver

afterEach(() => {
  globalThis.ResizeObserver = original
  vi.restoreAllMocks()
})

// One animation frame, since the watcher coalesces bursts.
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))

describe('watchFoldSize', () => {
  it('re-measures on a window resize even with no ResizeObserver at all', async () => {
    // @ts-expect-error -- deliberately removing it, which is the case this exists for
    delete globalThis.ResizeObserver
    const el = document.createElement('div')
    const onChange = vi.fn()

    const stop = watchFoldSize(el, onChange)
    expect(onChange).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('resize'))
    await nextFrame()
    expect(onChange).toHaveBeenCalled()
    stop()
  })

  it('stops listening once torn down', async () => {
    // @ts-expect-error -- as above
    delete globalThis.ResizeObserver
    const el = document.createElement('div')
    const onChange = vi.fn()

    const stop = watchFoldSize(el, onChange)
    stop()

    window.dispatchEvent(new Event('resize'))
    await nextFrame()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('observes the element too, and disconnects it', () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    globalThis.ResizeObserver = class {
      observe = observe
      disconnect = disconnect
      unobserve = vi.fn()
    } as unknown as typeof ResizeObserver

    const el = document.createElement('div')
    const stop = watchFoldSize(el, vi.fn())
    expect(observe).toHaveBeenCalledWith(el)

    stop()
    expect(disconnect).toHaveBeenCalled()
  })

  it('coalesces a burst of resizes into one measurement', async () => {
    // @ts-expect-error -- as above
    delete globalThis.ResizeObserver
    const el = document.createElement('div')
    const onChange = vi.fn()

    const stop = watchFoldSize(el, onChange)
    // Dragging a window edge fires continuously, and every measurement forces a
    // layout - so a burst has to collapse to one read.
    for (let i = 0; i < 20; i++) window.dispatchEvent(new Event('resize'))
    await nextFrame()
    expect(onChange).toHaveBeenCalledTimes(1)
    stop()
  })
})
