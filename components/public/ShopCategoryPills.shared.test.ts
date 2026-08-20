import { describe, it, expect } from 'vitest'
import { shopCategoryPillsCss } from '@/modules/shop/components/public/ShopCategoryPills.shared'

// A wrapping pill strip costs one row per two or three sub-category names, and
// on a phone that put four rows of navigation between the heading and the first
// product - the shopper's whole opening screen spent on chrome. Below the mobile
// breakpoint the strip is one scrolling row instead. Wider widths keep the block
// they have always had.

const BP = { tabletBp: '1024px', mobileBp: '640px' }
const css = shopCategoryPillsCss(BP)
const beforeMediaQuery = css.slice(0, css.indexOf('@media'))
const mobileBlock = css.slice(css.indexOf(`@media (max-width: ${BP.mobileBp})`))

describe('sub-category pill strip', () => {
  it('wraps into a block by default', () => {
    expect(beforeMediaQuery).toContain('flex-wrap: wrap')
  })

  it('becomes a single scrolling row on a phone', () => {
    expect(mobileBlock).toContain('flex-wrap: nowrap')
    expect(mobileBlock).toContain('overflow-x: auto')
    // Pills must not shrink to fit, or they all squeeze onto one row and the
    // strip never scrolls - which is the wrapping problem again, sideways.
    expect(mobileBlock).toContain('flex: none')
  })

  it("bakes the site's own breakpoint in rather than a hardcoded width", () => {
    expect(css).toContain('@media (max-width: 640px)')
    expect(shopCategoryPillsCss({ tabletBp: '900px', mobileBp: '480px' })).toContain('@media (max-width: 480px)')
  })
})
