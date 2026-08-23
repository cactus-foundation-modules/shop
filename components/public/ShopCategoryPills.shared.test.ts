import { describe, it, expect } from 'vitest'
import { shopCategoryPillsCss, rollUpProductCounts, splitPillsByPopularity } from '@/modules/shop/components/public/ShopCategoryPills.shared'

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

// A category with thirty sub-categories printed thirty pills, so the shopper met
// a wall of navigation before the first product. Capped, the busiest few print
// and the rest fold away - but every link stays in the markup, which is why the
// split returns the hidden ones rather than dropping them.

const cat = (id: string, name: string, parentId: string | null = null) => ({ id, name, parentId })

describe('rolled-up product counts', () => {
  it("adds a category's descendants to its own count", () => {
    const all = [cat('desks', 'Desks'), cat('sit-stand', 'Sit-stand', 'desks'), cat('electric', 'Electric', 'sit-stand')]
    const rolled = rollUpProductCounts(all, { desks: 2, 'sit-stand': 5, electric: 10 })
    expect(rolled.desks).toBe(17)
    expect(rolled['sit-stand']).toBe(15)
    expect(rolled.electric).toBe(10)
  })

  it('counts a category that files nothing itself but holds a full sub-tree', () => {
    const all = [cat('seating', 'Seating'), cat('mesh', 'Mesh', 'seating')]
    expect(rollUpProductCounts(all, { mesh: 40 }).seating).toBe(40)
  })

  it('terminates on a parent cycle rather than recursing forever', () => {
    const all = [cat('a', 'A', 'b'), cat('b', 'B', 'a')]
    expect(rollUpProductCounts(all, { a: 1, b: 2 })).toEqual({ a: 3, b: 3 })
  })
})

describe('splitting the strip at a limit', () => {
  const cats = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Bravo' },
    { id: 'c', name: 'Charlie' },
    { id: 'd', name: 'Delta' },
  ]
  const counts = { a: 1, b: 30, c: 30, d: 9 }

  it('shows the busiest first and folds the rest away', () => {
    const { shown, hidden } = splitPillsByPopularity(cats, counts, 2)
    expect(shown.map((c) => c.id)).toEqual(['b', 'c'])
    expect(hidden.map((c) => c.id)).toEqual(['d', 'a'])
  })

  it('breaks a tie on name so the order never shuffles between renders', () => {
    const reversed = [...cats].reverse()
    expect(splitPillsByPopularity(reversed, counts, 2).shown.map((c) => c.id)).toEqual(['b', 'c'])
  })

  it('leaves the shop order alone when there is no limit', () => {
    const { shown, hidden } = splitPillsByPopularity(cats, counts, 0)
    expect(shown).toEqual(cats)
    expect(hidden).toEqual([])
  })

  it('prints no toggle when the limit already covers the lot', () => {
    expect(splitPillsByPopularity(cats, counts, 4).hidden).toEqual([])
    expect(splitPillsByPopularity(cats, counts, 9).hidden).toEqual([])
  })

  it('treats a missing count as nothing rather than dropping the category', () => {
    const { shown, hidden } = splitPillsByPopularity(cats, { b: 5 }, 1)
    expect(shown.map((c) => c.id)).toEqual(['b'])
    expect(hidden).toHaveLength(3)
  })
})

describe('the more toggle', () => {
  it('hides the extras with CSS, so the links are still in the HTML', () => {
    expect(css).toContain('.shop-cat-pills-limited .shop-cat-pill-extra { display: none; }')
    expect(css).toContain('.shop-cat-pills-limited:has(.shop-cat-more-input:checked) .shop-cat-pill-extra')
  })

  it('leaves an old browser the plain strip rather than a dead button', () => {
    // Without :has the toggle cannot work, so it must not print - and the
    // extras must not be hidden either, or those sub-categories are unreachable.
    expect(css).toContain('@supports selector(:has(*))')
    // The at-rule itself, not the comment above it that names it.
    const supportsAt = css.indexOf('@supports selector(:has(*)) {')
    const beforeSupports = css.slice(0, supportsAt)
    expect(beforeSupports).toContain('.shop-cat-more {\n  display: none;')
    const supportsBlock = css.slice(supportsAt)
    expect(supportsBlock).toContain('.shop-cat-more { display: inline-flex; }')
    expect(supportsBlock.indexOf('.shop-cat-pill-extra { display: none; }')).toBeGreaterThan(-1)
  })

  it('keeps a focus ring on the pill, since the checkbox itself is off-screen', () => {
    expect(css).toContain('.shop-cat-more:has(.shop-cat-more-input:focus-visible)')
  })
})
