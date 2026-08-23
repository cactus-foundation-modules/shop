// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShopCategoryDescriptionFold } from '@/modules/shop/components/public/ShopCategoryDescriptionFold'

// The fold has to be right in the server-rendered markup, before any JavaScript
// runs: folding after hydration would paint the long description and then
// snatch the products up the screen. The toggle is the other way round - it has
// nowhere honest to sit until the blurb has been found, so it waits.

const PARAGRAPHS = ['First paragraph.', 'Second paragraph.']

const server = (foldStyle?: React.CSSProperties) => renderToStaticMarkup(
  <ShopCategoryDescriptionFold foldStyle={foldStyle} paragraphs={PARAGRAPHS} />,
)

beforeAll(() => {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

async function mount({ blurb }: { blurb: boolean }) {
  document.body.innerHTML = ''
  if (blurb) {
    const p = document.createElement('p')
    p.setAttribute('data-shop-blurb', '')
    p.textContent = 'The blurb.'
    document.body.appendChild(p)
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(<ShopCategoryDescriptionFold style={{ marginTop: '1.25rem' }} paragraphs={PARAGRAPHS} />) })
  return {
    container,
    blurbEl: document.querySelector<HTMLElement>('p[data-shop-blurb]'),
    toggle: () => document.querySelector<HTMLButtonElement>('.shop-cat-desc-toggle'),
    fold: () => document.querySelector<HTMLElement>('.shop-cat-desc-fold') as HTMLElement,
    click: async () => { await act(async () => { document.querySelector<HTMLButtonElement>('.shop-cat-desc-toggle')?.click() }) },
  }
}

describe('category description fold', () => {
  it('arrives folded, so the first paint is the short one', () => {
    const html = server()
    expect(html).toContain('data-folded="true"')
    expect(html).toMatch(/class="shop-cat-desc-fold"[^>]*hidden/)
  })

  it('keeps the full text in the markup for crawlers and for Read more', () => {
    const html = server()
    expect(html).toContain('First paragraph.')
    expect(html).toContain('Second paragraph.')
  })

  it('renders no toggle on the server, so it cannot flash in the wrong place', () => {
    // The stylesheet names the class either way; it is the button that waits.
    expect(server()).not.toContain('<button')
  })

  it('folds at every width - no breakpoint, no media query', () => {
    const html = server()
    const css = html.slice(0, html.indexOf('</style>'))
    expect(css).not.toContain('@media')
    // The old mobile-only line clamp is gone with it.
    expect(html).not.toContain('-webkit-line-clamp')
  })

  it('takes the fold back off when there is no scripting', () => {
    const html = server()
    const noscript = html.slice(html.indexOf('<noscript>'), html.indexOf('</noscript>'))
    expect(noscript).toContain('.shop-cat-desc-fold[hidden] { display: block !important; }')
  })

  it("puts the caller's column rules on the folded box itself", () => {
    expect(server({ columnWidth: '26rem' })).toMatch(/class="shop-cat-desc-fold"[^>]*style="column-width:26rem"/)
  })

  it('moves the toggle into the blurb, at the end of its text', async () => {
    const { blurbEl, toggle } = await mount({ blurb: true })
    const button = toggle()
    expect(button).toBeTruthy()
    expect(button?.parentElement).toBe(blurbEl)
    expect(blurbEl?.lastElementChild).toBe(button)
    expect(button?.textContent).toBe('Read more')
  })

  it('takes its own block out of the layout while it is shut', async () => {
    const { container } = await mount({ blurb: true })
    expect((container.firstElementChild as HTMLElement).style.display).toBe('contents')
  })

  it('opens the fold and hands the block its spacing back', async () => {
    const { container, fold, toggle, click } = await mount({ blurb: true })
    expect(fold().hidden).toBe(true)
    await click()
    expect(fold().hidden).toBe(false)
    expect(toggle()?.textContent).toBe('Show less')
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.display).not.toBe('contents')
    expect(wrapper.style.marginTop).toBe('1.25rem')
  })

  it('wires the toggle to the text it opens', async () => {
    const { fold, toggle } = await mount({ blurb: true })
    expect(toggle()?.getAttribute('aria-controls')).toBe(fold().id)
    expect(toggle()?.getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps the toggle in its own block when there is no blurb to live in', async () => {
    const { container, toggle } = await mount({ blurb: false })
    expect(toggle()).toBeTruthy()
    expect(container.contains(toggle())).toBe(true)
    // A block that is only a link does not want a whole description's margin.
    expect((container.firstElementChild as HTMLElement).style.marginTop).toBe('0.25rem')
  })
})
