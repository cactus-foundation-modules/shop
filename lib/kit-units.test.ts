import { describe, expect, it } from 'vitest'
import { expandToParts, type KitParts } from '@/modules/shop/lib/kit-units'

const kits: KitParts = new Map([
  ['kit-chair', [{ componentProductId: 'seat', quantity: 1 }, { componentProductId: 'base', quantity: 2 }]],
])

describe('expandToParts', () => {
  it('passes an ordinary product straight through', () => {
    expect(expandToParts([{ productId: 'lamp', quantity: 3 }], kits)).toEqual(new Map([['lamp', 3]]))
  })

  it('turns a kit into its parts, times the number sold', () => {
    expect(expandToParts([{ productId: 'kit-chair', quantity: 3 }], kits)).toEqual(new Map([['seat', 3], ['base', 6]]))
  })

  it('sums a part sold on its own and inside a kit', () => {
    const out = expandToParts([{ productId: 'seat', quantity: 2 }, { productId: 'kit-chair', quantity: 1 }], kits)
    expect(out.get('seat')).toBe(3)
    expect(out.get('base')).toBe(2)
  })

  it('ignores lines with nothing to move', () => {
    expect(expandToParts([{ productId: 'seat', quantity: 0 }, { productId: 'kit-chair', quantity: -1 }, { productId: 'x', quantity: Number.NaN }], kits).size).toBe(0)
  })

  it('treats a kit with no parts as an ordinary product', () => {
    expect(expandToParts([{ productId: 'empty', quantity: 2 }], new Map([['empty', []]]))).toEqual(new Map([['empty', 2]]))
  })
})
