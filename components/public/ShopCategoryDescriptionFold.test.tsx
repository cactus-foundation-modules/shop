import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShopCategoryDescriptionFold } from '@/modules/shop/components/public/ShopCategoryDescriptionFold'

// The fold has to be right in the server-rendered markup, before any JavaScript
// runs: folding after hydration would paint the long description and then
// snatch the products up the screen. And it has to be releasable without
// JavaScript, or a reader with it switched off never sees the rest of it.

const render = (foldStyle?: React.CSSProperties) => renderToStaticMarkup(
  <ShopCategoryDescriptionFold
    foldStyle={foldStyle}
    paragraphs={['First paragraph.', 'Second paragraph.']}
  />,
)

describe('category description fold', () => {
  it('arrives folded, so the first paint is the short one', () => {
    const html = render()
    expect(html).toContain('data-folded="true"')
    expect(html).toMatch(/class="shop-cat-desc-fold"[^>]*hidden/)
  })

  it('leaves the opening paragraph on the page', () => {
    const html = render()
    const fold = html.indexOf('class="shop-cat-desc-fold"')
    expect(html.indexOf('First paragraph.')).toBeLessThan(fold)
  })

  it('keeps the full text in the markup for crawlers and for Read more', () => {
    const html = render()
    expect(html).toContain('First paragraph.')
    expect(html).toContain('Second paragraph.')
  })

  it('folds at every width - no breakpoint, no media query', () => {
    const html = render()
    const css = html.slice(0, html.indexOf('</style>'))
    expect(css).not.toContain('@media')
    // The old mobile-only line clamp is gone with it.
    expect(html).not.toContain('-webkit-line-clamp')
  })

  it('puts the toggle inline at the end of the opening paragraph', () => {
    const html = render()
    const css = html.slice(0, html.indexOf('</style>'))
    expect(css).toContain('.shop-cat-desc-toggle {\n  display: inline;')
    expect(html).toMatch(/First paragraph\.<button[^>]*class="shop-cat-desc-toggle"/)
    expect(html).toContain('Read more')
  })

  it('takes the fold back off when there is no scripting', () => {
    const html = render()
    const noscript = html.slice(html.indexOf('<noscript>'), html.indexOf('</noscript>'))
    expect(noscript).toContain('.shop-cat-desc-fold[hidden] { display: block !important; }')
    expect(noscript).toContain('.shop-cat-desc-toggle { display: none !important; }')
  })

  it('wires the toggle to the text it opens', () => {
    const html = render()
    const controls = /aria-controls="([^"]+)"/.exec(html)?.[1]
    expect(controls).toBeTruthy()
    expect(html).toContain(`id="${controls}"`)
    expect(html).toContain('aria-expanded="false"')
  })

  it('offers no Read more when there is nothing behind it', () => {
    const html = renderToStaticMarkup(
      <ShopCategoryDescriptionFold className="x" paragraphs={['Only paragraph.']} />,
    )
    expect(html).toContain('Only paragraph.')
    expect(html).not.toContain('Read more')
    expect(html).not.toContain('shop-cat-desc-fold"')
  })

  it("puts the caller's column rules on the folded box itself", () => {
    expect(render({ columnWidth: '26rem' })).toMatch(/class="shop-cat-desc-fold"[^>]*style="column-width:26rem"/)
  })
})
