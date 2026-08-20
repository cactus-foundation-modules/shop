import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShopCategoryDescriptionClamp } from '@/modules/shop/components/public/ShopCategoryDescriptionClamp'

// The fold has to be right in the server-rendered markup, before any
// JavaScript runs: clamping after hydration would paint the long description
// and then snatch the products up the screen. And it has to be releasable
// without JavaScript, or a reader with it switched off is stuck at four lines.

const BP = { tabletBp: '1024px', mobileBp: '640px' }

const render = () => renderToStaticMarkup(
  <ShopCategoryDescriptionClamp breakpoints={BP}>
    <p>First paragraph.</p>
    <p>Second paragraph.</p>
  </ShopCategoryDescriptionClamp>,
)

// Everything left once each @media block is removed, braces matched - i.e. the
// rules that apply at every width.
function stripAtRules(css: string): string {
  let out = ''
  for (let i = 0; i < css.length; i++) {
    if (!css.startsWith('@media', i)) { out += css[i]; continue }
    i = css.indexOf('{', i)
    for (let depth = 1; depth > 0 && i < css.length; ) {
      i++
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
    }
  }
  return out
}

describe('category description fold', () => {
  it('arrives folded, so the first paint on a phone is the short one', () => {
    expect(render()).toContain("data-folded=\"true\"")
  })

  it('keeps the full text in the markup for crawlers and for Read more', () => {
    const html = render()
    expect(html).toContain('First paragraph.')
    expect(html).toContain('Second paragraph.')
  })

  it('only folds below the mobile breakpoint', () => {
    const html = render()
    expect(html).toContain('@media (max-width: 640px)')
    // The clamp itself must sit inside that query, never at the top level.
    const beforeQuery = html.slice(0, html.indexOf('@media'))
    expect(beforeQuery).not.toContain('-webkit-line-clamp')
  })

  it('hides the toggle above the breakpoint', () => {
    expect(render()).toContain('.shop-cat-desc-toggle { display: none; }')
  })

  it('drops the columns before clamping, or the clamp silently does nothing', () => {
    // A multi-column container is blockified whatever `display` asks for, so
    // -webkit-box is ignored and the fold measures its full height with the
    // line-clamp computed and useless - it looks fine in the markup and does
    // nothing on screen. The column rules come from the caller's inline style,
    // so only !important can take them off.
    const html = render()
    const foldRule = html.slice(html.indexOf("shop-cat-desc-fold[data-folded='true'] {"))
    const block = foldRule.slice(0, foldRule.indexOf('}'))
    expect(block).toContain('columns: auto !important')
    expect(block).toContain('column-width: auto !important')
    expect(block).toContain('-webkit-line-clamp')
  })

  it('assumes the toggle is needed until it has measured', () => {
    // The server cannot measure, and every real description overflows, so it
    // renders needed. The measure only ever takes the toggle away - which keeps
    // the common case perfectly still and corrects only the rare short one.
    expect(render()).toContain('data-needed="true"')
  })

  it('has a rule that hides a toggle with nothing behind it, at every width', () => {
    const css = render().slice(0, render().indexOf('</style>'))
    expect(css).toContain(".shop-cat-desc-toggle[data-needed='false'] { display: none; }")
    // It has to sit OUTSIDE the media query. Nested, a short description would
    // keep a useless toggle at any width above the breakpoint - which includes a
    // phone turned sideways.
    expect(stripAtRules(css)).toContain("[data-needed='false']")
  })

  it('takes the fold back off when there is no scripting', () => {
    const html = render()
    const noscript = html.slice(html.indexOf('<noscript>'), html.indexOf('</noscript>'))
    expect(noscript).toContain('-webkit-line-clamp: none')
    expect(noscript).toContain('.shop-cat-desc-toggle { display: none !important; }')
  })

  it('wires the toggle to the text it opens', () => {
    const html = render()
    const controls = /aria-controls="([^"]+)"/.exec(html)?.[1]
    expect(controls).toBeTruthy()
    expect(html).toContain(`id="${controls}"`)
    expect(html).toContain('aria-expanded="false"')
  })

  it('puts the caller\'s column rules on the folded box itself', () => {
    // Not on a wrapper: the fold turns this element into a -webkit-box, and a
    // column container in between would be the thing getting clamped.
    const html = renderToStaticMarkup(
      <ShopCategoryDescriptionClamp breakpoints={BP} foldStyle={{ columnWidth: '26rem' }}>
        <p>Text.</p>
      </ShopCategoryDescriptionClamp>,
    )
    expect(html).toMatch(/class="shop-cat-desc-fold"[^>]*style="column-width:26rem"/)
  })
})
