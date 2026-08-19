import { describe, expect, it } from 'vitest'
import { applyMinimumOrderQuantities, blockedLinesMessage, type PoolingLine } from '@/modules/shop/lib/checkout'
import { resolveLineMeta } from '@/modules/shop/lib/line-meta'
import { resolveMinOrderQuantity } from '@/modules/shop/lib/min-order'

// A minimum belongs to a LISTING, not to a basket line. The first cut of this
// failed any line under its own minimum, which told a shopper wanting four
// chairs in four colours that they had to take four of ONE colour - so these
// pin the pooling rule rather than leaving it to review.

type Opts = {
  productId: string
  quantity: number
  min: number
  group?: string | null
  available?: boolean
  reason?: string
}

const line = ({ productId, quantity, min, group = null, available = true, reason }: Opts): PoolingLine => ({
  product: { id: productId } as PoolingLine['product'],
  quantity,
  unitPrice: 10,
  lineSubtotal: 10 * quantity,
  available,
  availabilityReason: reason,
  isPreOrder: false,
  minOrderQuantity: min,
  minOrderPooled: false,
  minOrderGroupKey: group,
  lineMeta: null,
})

describe('applyMinimumOrderQuantities', () => {
  it('leaves a basket alone when nothing carries a minimum', () => {
    const out = applyMinimumOrderQuantities([line({ productId: 'p1', quantity: 1, min: 1 })])
    expect(out[0]!.available).toBe(true)
    expect(out[0]!.minOrderPooled).toBe(false)
  })

  it('counts four different variations of one listing towards its minimum of four', () => {
    const out = applyMinimumOrderQuantities([
      line({ productId: 'teal', quantity: 1, min: 4, group: 'chair' }),
      line({ productId: 'black', quantity: 1, min: 4, group: 'chair' }),
      line({ productId: 'grey', quantity: 1, min: 4, group: 'chair' }),
      line({ productId: 'blue', quantity: 1, min: 4, group: 'chair' }),
    ])
    expect(out.every((l) => l.available)).toBe(true)
    expect(out.every((l) => l.minOrderPooled)).toBe(true)
  })

  it('holds every line of a short pool back, naming what is still needed', () => {
    const out = applyMinimumOrderQuantities([
      line({ productId: 'teal', quantity: 2, min: 4, group: 'chair' }),
      line({ productId: 'black', quantity: 1, min: 4, group: 'chair' }),
    ])
    expect(out.map((l) => l.available)).toEqual([false, false])
    expect(out[0]!.availabilityReason).toBe('The smallest order for this is 4 - add 1 more, in any mix of options')
  })

  it('keeps an ordinary product answering for its own quantity', () => {
    const out = applyMinimumOrderQuantities([line({ productId: 'p1', quantity: 3, min: 4 })])
    expect(out[0]!.available).toBe(false)
    expect(out[0]!.availabilityReason).toBe('The smallest order for this is 4 - add 1 more')
    expect(out[0]!.minOrderPooled).toBe(false)
  })

  it('pools two lines of one product, so a pair of personalised lines add up', () => {
    const out = applyMinimumOrderQuantities([
      line({ productId: 'mug', quantity: 2, min: 4 }),
      line({ productId: 'mug', quantity: 2, min: 4 }),
    ])
    expect(out.every((l) => l.available)).toBe(true)
  })

  it('never lets one listing bleed into another', () => {
    const out = applyMinimumOrderQuantities([
      line({ productId: 'teal', quantity: 2, min: 4, group: 'chair' }),
      line({ productId: 'desk', quantity: 2, min: 4, group: 'desk-listing' }),
    ])
    expect(out.map((l) => l.available)).toEqual([false, false])
  })

  it('takes the largest minimum in the pool, so a stricter combination raises the bar', () => {
    const out = applyMinimumOrderQuantities([
      line({ productId: 'teal', quantity: 4, min: 4, group: 'chair' }),
      line({ productId: 'special', quantity: 2, min: 10, group: 'chair' }),
    ])
    expect(out.map((l) => l.available)).toEqual([false, false])
    expect(out[0]!.minOrderQuantity).toBe(10)
    expect(out[0]!.availabilityReason).toBe('The smallest order for this is 10 - add 4 more, in any mix of options')
  })

  it('leaves a line that already failed for another reason saying why', () => {
    const out = applyMinimumOrderQuantities([
      line({ productId: 'teal', quantity: 1, min: 4, group: 'chair', available: false, reason: 'Out of stock' }),
    ])
    expect(out[0]!.availabilityReason).toBe('Out of stock')
  })
})

// The other half of the bug, and the one that let a basket of one through the
// checkout: a variation child's own min_order_quantity is nearly always NULL,
// because the owner sets the figure on the PARENT. Shop reading the child row
// alone therefore saw no minimum at all. resolveLineMeta has to carry the
// resolver's answer through, and resolveCartLines has to take the larger of the
// two - so both are pinned here rather than left to a live basket to discover.
describe('the minimum a resolver knows and the product row does not', () => {
  it('carries a resolver`s minOrder through the meta merge', async () => {
    const res = await resolveLineMeta(
      { id: 'child' } as Parameters<typeof resolveLineMeta>[0],
      undefined,
      [() => ({ valid: true, priceAdjust: 0, persistMeta: null, minOrder: { key: 'parent', quantity: 4 } })],
    )
    expect(res.minOrder).toEqual({ key: 'parent', quantity: 4 })
  })

  it('lets a second resolver raise the figure but never lower it', async () => {
    const res = await resolveLineMeta(
      { id: 'child' } as Parameters<typeof resolveLineMeta>[0],
      undefined,
      [
        () => ({ valid: true, priceAdjust: 0, persistMeta: null, minOrder: { key: 'parent', quantity: 4 } }),
        () => ({ valid: true, priceAdjust: 0, persistMeta: null, minOrder: { key: 'other', quantity: 10 } }),
        () => ({ valid: true, priceAdjust: 0, persistMeta: null, minOrder: { key: 'other', quantity: 2 } }),
      ],
    )
    expect(res.minOrder).toEqual({ key: 'parent', quantity: 10 })
  })

  it('leaves minOrder null when no resolver offers one', async () => {
    const res = await resolveLineMeta(
      { id: 'p' } as Parameters<typeof resolveLineMeta>[0],
      undefined,
      [() => ({ valid: true, priceAdjust: 0, persistMeta: null })],
    )
    expect(res.minOrder ?? null).toBeNull()
  })
})

// The fallback itself: a blank child means "as the listing says", NOT "no
// minimum", which is the distinction the whole feature turns on.
describe('resolveMinOrderQuantity', () => {
  it('gives a blank variation its listing`s figure', () => {
    expect(resolveMinOrderQuantity(null, 4)).toBe(4)
  })

  it('lets a variation with its own figure override the listing', () => {
    expect(resolveMinOrderQuantity(10, 4)).toBe(10)
    expect(resolveMinOrderQuantity(2, 4)).toBe(2)
  })

  it('reads 1, 0 and nothing at all as no minimum', () => {
    expect(resolveMinOrderQuantity(1, null)).toBe(1)
    expect(resolveMinOrderQuantity(0, null)).toBe(1)
    expect(resolveMinOrderQuantity(null, null)).toBe(1)
  })
})

// What a shopper is told when the checkout refuses the basket. The Order review
// block replaces itself with this one string, so it has to name the product as
// well as the problem - "the smallest order for this is 4" on its own, with no
// "this" on screen, is what sent Chris back to ask which product it meant.
describe('blockedLinesMessage', () => {
  const blocked = (name: string, reason: string, displayName?: string) => ({
    product: { id: name, name },
    availabilityReason: reason,
    displayTitle: displayName ? { name: displayName } : null,
  } as unknown as PoolingLine)

  it('names the product when every blocked line is the same one', () => {
    expect(blockedLinesMessage([
      blocked('ISO Chair - Teal', 'The smallest order for this is 4 - add 1 more, in any mix of options', 'ISO Stacking Chair'),
      blocked('ISO Chair - Black', 'The smallest order for this is 4 - add 1 more, in any mix of options', 'ISO Stacking Chair'),
    ])).toBe('ISO Stacking Chair: The smallest order for this is 4 - add 1 more, in any mix of options')
  })

  it('prefers a resolver`s retitle to the hidden variation`s own name', () => {
    expect(blockedLinesMessage([blocked('ISO Chair - Teal / Black', 'Out of stock', 'ISO Stacking Chair')]))
      .toBe('ISO Stacking Chair: Out of stock')
  })

  it('drops the name when two different products are blocked for one reason', () => {
    expect(blockedLinesMessage([blocked('Mug', 'Out of stock'), blocked('Desk', 'Out of stock')]))
      .toBe('Out of stock')
  })

  it('falls back to the general wording when the reasons disagree', () => {
    expect(blockedLinesMessage([
      blocked('Mug', 'Out of stock'),
      blocked('Mug', 'The smallest order for this is 4 - add 1 more'),
    ])).toBe('Some items in your basket are no longer available.')
  })
})
