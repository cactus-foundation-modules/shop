import { describe, it, expect } from 'vitest'
import { galleryCss, tabsCss } from '@/modules/shop/components/puck/parts/detail-parts'

// Both scrolling strips on a product page - the gallery thumbnails and the
// section tabs - used to fade and plate their arrows in
// `var(--color-page-bg, var(--color-bg))`, copying the admin tab bar. The admin
// bar can name its background because it only ever runs on one page. On a
// storefront --color-page-bg resolved to #FFFFFF while the pages are warm
// white, so each arrow printed as a white tile with four visible rounded
// corners. Masks have no colour to get wrong.

const BP = { tabletBp: '1024px', mobileBp: '640px' }
const gallery = galleryCss(BP, 60)
const tabs = tabsCss(BP)

const arrowRule = (css: string, selector: string) => {
  const at = css.indexOf(selector + '{')
  return at === -1 ? '' : css.slice(at, css.indexOf('}', at))
}

describe('product page scroll strips', () => {
  it('fades the thumbnails with a mask on the strip itself', () => {
    expect(gallery).toContain('.spd-thumbs-wrap[data-fade-start] .spd-thumbs')
    expect(gallery).toContain('.spd-thumbs-wrap[data-fade-end] .spd-thumbs')
    expect(gallery).toContain('mask-image:linear-gradient(to left,transparent 0,#000 3.5rem)')
    expect(gallery).toContain('-webkit-mask-image')
  })

  it('fades the tab strip the same way', () => {
    expect(tabs).toContain('.spd-tab-shell[data-fade-left] .spd-tab-nav')
    expect(tabs).toContain('.spd-tab-shell[data-fade-right] .spd-tab-nav')
    expect(tabs).toContain('mask-image:linear-gradient(to right,transparent 0,#000 3.5rem)')
  })

  it('fades both ends at once when the strip sits in the middle', () => {
    expect(gallery).toContain('.spd-thumbs-wrap[data-fade-start][data-fade-end] .spd-thumbs')
    expect(tabs).toContain('.spd-tab-shell[data-fade-left][data-fade-right] .spd-tab-nav')
  })

  it('gives neither arrow a plate of its own', () => {
    for (const rule of [arrowRule(gallery, '.spd-thumbs-arrow'), arrowRule(tabs, '.spd-tab-arrow')]) {
      expect(rule).toContain('background:none')
      expect(rule).not.toContain('--color-page-bg')
      // A stray global button radius is what turned the plate into four corner
      // specks; with no plate it cannot come back.
      expect(rule).toContain('border-radius:0')
    }
  })

  it('leaves no painted fade elements behind', () => {
    expect(gallery).not.toContain('.spd-thumbs-fade')
    expect(tabs).not.toContain('.spd-tab-fade')
    expect(tabs).not.toContain('--spd-tabnav-fade')
  })

  it('keeps the sticky shell painting its own fill - that one really is a fill', () => {
    // The mask is for the edges of the strip. A pinned strip still needs
    // something opaque behind it or the panel scrolls through it.
    expect(tabs).toContain('.spd-tab-shell.sticky{position:sticky')
    expect(tabs).toContain('background:var(--spd-tabnav-bg,var(--color-page-bg,var(--color-bg)))')
  })
})
