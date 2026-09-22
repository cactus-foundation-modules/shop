import { describe, expect, it } from 'vitest'
import { fulfilmentAttention } from '@/modules/shop/lib/order-attention'

// What a freshly paid order tells the owner. Goods the shop may not have hold
// the order; a coupon used once too often is only noted, because the order can
// still go out.

const none = { shortfalls: [], overshoots: [], coupon: null }

describe('fulfilmentAttention', () => {
  it('says nothing about an ordinary order', () => {
    expect(fulfilmentAttention(none)).toBeNull()
  })

  it('holds an order paid for with too little stock left, and names the product', () => {
    const attention = fulfilmentAttention({ ...none, shortfalls: [{ productName: 'Oak desk', ordered: 2, inStock: 1 }] })
    expect(attention?.hold).toBe(true)
    expect(attention?.note).toContain('Oak desk: 2 ordered, 1 in stock')
  })

  it('holds an order that took a pre-order past its limit', () => {
    const attention = fulfilmentAttention({ ...none, overshoots: [{ productName: 'Pod', count: 21, limit: 20 }] })
    expect(attention?.hold).toBe(true)
    expect(attention?.note).toContain('Pod: 21 on pre-order against a limit of 20')
  })

  it('notes, without holding, a coupon used past its overall limit', () => {
    const attention = fulfilmentAttention({ ...none, coupon: { kind: 'usage-limit', code: 'SUMMER', limit: 50 } })
    expect(attention?.hold).toBe(false)
    expect(attention?.note).toContain('SUMMER')
    expect(attention?.note).toContain('50 times')
  })

  it('notes, without holding, a coupon used past its per-customer limit', () => {
    const attention = fulfilmentAttention({ ...none, coupon: { kind: 'per-customer', code: 'WELCOME', limit: 1, uses: 2 } })
    expect(attention?.hold).toBe(false)
    expect(attention?.note).toContain('WELCOME on 2 paid orders, over its limit of 1')
  })

  it('puts everything in one note and holds if any of it is about goods', () => {
    const attention = fulfilmentAttention({
      shortfalls: [{ productName: 'Oak desk', ordered: 1, inStock: 0 }],
      overshoots: [],
      coupon: { kind: 'usage-limit', code: 'SUMMER', limit: 1 },
    })
    expect(attention?.hold).toBe(true)
    expect(attention?.note).toContain('Oak desk')
    expect(attention?.note).toContain('used once')
  })
})
