import { describe, expect, it } from 'vitest'
import { pickWindow } from '@/modules/shop/lib/grid-window'

// What an on-demand grid is allowed to hand back. Two separate promises are
// being kept here and both fail silently if broken: that a shopper reaches every
// product (a dropped index looks like a catalogue that ends early), and that a
// browser naming ids gets back only products the block's own query returned.

const products = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `Product ${i}` }))

describe('pickWindow - by offset', () => {
  it('takes the slice asked for', () => {
    expect(pickWindow(products, { offset: 0, count: 3 }, 24).map((p) => p.id)).toEqual(['p0', 'p1', 'p2'])
    expect(pickWindow(products, { offset: 3, count: 3 }, 24).map((p) => p.id)).toEqual(['p3', 'p4', 'p5'])
  })

  it('stops at the end rather than running past it', () => {
    expect(pickWindow(products, { offset: 8, count: 24 }, 24).map((p) => p.id)).toEqual(['p8', 'p9'])
    expect(pickWindow(products, { offset: 99, count: 5 }, 24)).toEqual([])
  })

  it('reaches every product across consecutive windows, exactly once', () => {
    const seen: string[] = []
    for (let offset = 0; offset < products.length; offset += 4) {
      seen.push(...pickWindow(products, { offset, count: 4 }, 24).map((p) => p.id))
    }
    expect(seen).toEqual(products.map((p) => p.id))
  })

  it('never renders more than one call is allowed to', () => {
    expect(pickWindow(products, { offset: 0, count: 10 }, 4)).toHaveLength(4)
  })

  it('survives nonsense from the wire rather than throwing', () => {
    expect(pickWindow(products, { offset: -5, count: 2 }, 24).map((p) => p.id)).toEqual(['p0', 'p1'])
    expect(pickWindow(products, { offset: Number.NaN, count: Number.NaN }, 24).map((p) => p.id)).toEqual(['p0'])
    expect(pickWindow(products, { offset: 0, count: 1e9 }, 24)).toHaveLength(10)
  })
})

describe('pickWindow - by id', () => {
  it('answers in the order asked for, not the order held', () => {
    expect(pickWindow(products, { ids: ['p4', 'p1', 'p7'] }, 24).map((p) => p.id)).toEqual(['p4', 'p1', 'p7'])
  })

  it('drops an id the query did not return, and says nothing about it', () => {
    const picked = pickWindow(products, { ids: ['p1', 'not-in-this-grid', 'p2'] }, 24)
    expect(picked.map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('returns nothing at all when nothing asked for is on the list', () => {
    expect(pickWindow(products, { ids: ['stolen-id', 'another'] }, 24)).toEqual([])
  })

  it('never renders more than one call is allowed to, however many ids arrive', () => {
    const ids = Array.from({ length: 500 }, (_, i) => `p${i % 10}`)
    expect(pickWindow(products, { ids }, 24)).toHaveLength(24)
  })

  it('survives an empty list', () => {
    expect(pickWindow(products, { ids: [] }, 24)).toEqual([])
  })
})
