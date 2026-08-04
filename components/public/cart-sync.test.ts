import { describe, it, expect } from 'vitest'
import { mergeCarts } from '@/modules/shop/components/public/cart-sync'

// The one piece of sync that can quietly cost a shopper money: signing in joins
// the basket in this browser to the one on the server, and getting the join
// wrong means somebody buys six chairs they asked for once.

describe('mergeCarts', () => {
  it('keeps a basket that only exists locally', () => {
    expect(mergeCarts([{ productId: 'p1', quantity: 2 }], [])).toEqual([{ productId: 'p1', quantity: 2 }])
  })

  it('adopts a basket that only exists on the server', () => {
    expect(mergeCarts([], [{ productId: 'p1', quantity: 3 }])).toEqual([{ productId: 'p1', quantity: 3 }])
  })

  it('takes the larger quantity rather than the sum for a line in both', () => {
    const merged = mergeCarts([{ productId: 'p1', quantity: 1 }], [{ productId: 'p1', quantity: 4 }])
    expect(merged).toEqual([{ productId: 'p1', quantity: 4 }])
  })

  it('leaves an already-level basket exactly as it was', () => {
    const lines = [{ productId: 'p1', quantity: 2 }, { productId: 'p2', quantity: 1 }]
    expect(mergeCarts(lines, lines)).toEqual(lines)
  })

  it('unions lines the two sides do not share, local first', () => {
    const merged = mergeCarts(
      [{ productId: 'p1', quantity: 1 }],
      [{ productId: 'p2', quantity: 5 }],
    )
    expect(merged).toEqual([{ productId: 'p1', quantity: 1 }, { productId: 'p2', quantity: 5 }])
  })

  it('matches personalised lines on lineId, not productId', () => {
    const merged = mergeCarts(
      [{ productId: 'p1', quantity: 1, lineId: 'a', meta: { engraving: 'Ada' } }],
      [
        { productId: 'p1', quantity: 2, lineId: 'a', meta: { engraving: 'Ada' } },
        { productId: 'p1', quantity: 1, lineId: 'b', meta: { engraving: 'Grace' } },
      ],
    )
    expect(merged).toEqual([
      { productId: 'p1', quantity: 2, lineId: 'a', meta: { engraving: 'Ada' } },
      { productId: 'p1', quantity: 1, lineId: 'b', meta: { engraving: 'Grace' } },
    ])
  })

  it('never mutates either side', () => {
    const local = [{ productId: 'p1', quantity: 1 }]
    const server = [{ productId: 'p1', quantity: 9 }]
    mergeCarts(local, server)
    expect(local).toEqual([{ productId: 'p1', quantity: 1 }])
    expect(server).toEqual([{ productId: 'p1', quantity: 9 }])
  })
})
