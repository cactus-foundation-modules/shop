// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShopCategoryPillsScroller } from '@/modules/shop/components/public/ShopCategoryPillsScroller'

// On a phone the strip is one row you swipe, and nothing said so. The chevrons
// have to be earned by real overflow, though: printed unconditionally they turn
// up on a desktop strip that wraps and scrolls nowhere, and printed in the
// server markup they would flash in and out on hydration.

// Href built from a variable because a literal `/shop/...` trips
// @next/next/no-html-link-for-pages - the same dodge the shop's own blocks use.
const base = '/shop/categories'

const strip = (
  <nav className="shop-cat-pills" aria-label="Sub-categories">
    <a className="shop-cat-pill" href={`${base}/one`}>One</a>
    <label className="shop-cat-pill shop-cat-more"><input type="checkbox" className="shop-cat-more-input" /></label>
    <a className="shop-cat-pill shop-cat-pill-extra" href={`${base}/two`}>Two</a>
  </nav>
)

beforeAll(() => {
  // jsdom ships neither, and the component is measuring chrome - it must not
  // fall over on a page where the observer is missing.
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

async function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<ShopCategoryPillsScroller>{strip}</ShopCategoryPillsScroller>) })
  const nav = container.querySelector<HTMLElement>('.shop-cat-pills') as HTMLElement
  const overflow = (scrollWidth: number, clientWidth: number, scrollLeft = 0) => {
    Object.defineProperty(nav, 'scrollWidth', { value: scrollWidth, configurable: true })
    Object.defineProperty(nav, 'clientWidth', { value: clientWidth, configurable: true })
    Object.defineProperty(nav, 'scrollLeft', { value: scrollLeft, writable: true, configurable: true })
  }
  return { container, nav, overflow }
}

describe('pill strip scroll affordance', () => {
  it('renders no chrome on the server, so the first paint has nothing to undo', () => {
    const html = renderToStaticMarkup(<ShopCategoryPillsScroller>{strip}</ShopCategoryPillsScroller>)
    expect(html).toContain('class="shop-cat-scroller"')
    expect(html).toContain('shop-cat-pills')
    expect(html).not.toContain('shop-cat-arrow')
    expect(html).not.toContain('shop-cat-fade')
  })

  it('leaves a strip that fits alone - no arrows where there is nothing to scroll to', async () => {
    const { container } = await mount()
    expect(container.querySelectorAll('.shop-cat-arrow')).toHaveLength(0)
  })

  it('fades and points the way once the row runs past its edge', async () => {
    const { container, nav, overflow } = await mount()
    overflow(600, 300)
    await act(async () => { nav.dispatchEvent(new Event('scroll')) })
    expect(container.querySelector('.shop-cat-arrow-right')).not.toBeNull()
    expect(container.querySelector('.shop-cat-fade-right')).not.toBeNull()
    // Nothing to the left yet - the strip has not moved.
    expect(container.querySelector('.shop-cat-arrow-left')).toBeNull()
  })

  it('swaps to the other edge when the strip is scrolled to the end', async () => {
    const { container, nav, overflow } = await mount()
    overflow(600, 300, 300)
    await act(async () => { nav.dispatchEvent(new Event('scroll')) })
    expect(container.querySelector('.shop-cat-arrow-left')).not.toBeNull()
    expect(container.querySelector('.shop-cat-arrow-right')).toBeNull()
  })

  it('re-measures when the more toggle lets the rest of the pills in', async () => {
    const { container, nav, overflow } = await mount()
    expect(container.querySelectorAll('.shop-cat-arrow')).toHaveLength(0)
    // Opening the fold widens the row without resizing the box the observer is
    // watching, so only the toggle's own change event can catch it.
    overflow(900, 300)
    const toggle = container.querySelector<HTMLInputElement>('.shop-cat-more-input') as HTMLInputElement
    await act(async () => { toggle.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(container.querySelector('.shop-cat-arrow-right')).not.toBeNull()
    expect(nav.scrollWidth).toBe(900)
  })

  it('labels the buttons for anyone not looking at a chevron', async () => {
    const { container, nav, overflow } = await mount()
    overflow(600, 300, 150)
    await act(async () => { nav.dispatchEvent(new Event('scroll')) })
    expect(container.querySelector('.shop-cat-arrow-left')?.getAttribute('aria-label')).toBe('Scroll sub-categories left')
    expect(container.querySelector('.shop-cat-arrow-right')?.getAttribute('aria-label')).toBe('Scroll sub-categories right')
  })
})
