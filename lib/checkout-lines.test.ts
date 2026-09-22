import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  CHECKOUT_LINE_META_MAX_BYTES,
  CHECKOUT_LINE_META_TOO_LARGE_MESSAGE,
  CHECKOUT_MAX_LINES,
  CHECKOUT_TOO_MANY_LINES_MESSAGE,
  CheckoutLinesSchema,
  checkoutLinesRefusal,
} from '@/modules/shop/lib/checkout-lines'
import { GUEST_CART_MAX_LINES } from '@/modules/shop/lib/db/guest-cart'
import { MEMBER_CART_MAX_LINES } from '@/modules/shop/lib/db/member-cart'

// The ceilings every public checkout route puts on the basket it is handed. The
// point is that they are never tighter than the basket stores: anything a
// shopper's basket could hold must still be payable.

const Body = z.object({ lines: CheckoutLinesSchema, couponCode: z.string().min(1) })

function lines(count: number, meta?: Record<string, unknown>) {
  return Array.from({ length: count }, (_, i) => ({ productId: `p${i}`, quantity: 1, ...(meta ? { meta } : {}) }))
}

describe('CheckoutLinesSchema', () => {
  it('takes as many lines as either basket store keeps', () => {
    expect(CHECKOUT_MAX_LINES).toBeGreaterThanOrEqual(GUEST_CART_MAX_LINES)
    expect(CHECKOUT_MAX_LINES).toBeGreaterThanOrEqual(MEMBER_CART_MAX_LINES)
    expect(CheckoutLinesSchema.safeParse(lines(CHECKOUT_MAX_LINES)).success).toBe(true)
  })

  it('refuses one line more, in plain words', () => {
    const parsed = Body.safeParse({ lines: lines(CHECKOUT_MAX_LINES + 1), couponCode: 'X' })
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(checkoutLinesRefusal(parsed.error)).toBe(CHECKOUT_TOO_MANY_LINES_MESSAGE)
  })

  it("takes line options up to the basket stores' own ceiling", () => {
    const meta = { note: 'x'.repeat(CHECKOUT_LINE_META_MAX_BYTES - JSON.stringify({ note: '' }).length) }
    expect(JSON.stringify(meta).length).toBe(CHECKOUT_LINE_META_MAX_BYTES)
    expect(CheckoutLinesSchema.safeParse(lines(1, meta)).success).toBe(true)
  })

  it('refuses line options past it, in plain words', () => {
    const meta = { note: 'x'.repeat(CHECKOUT_LINE_META_MAX_BYTES) }
    const parsed = Body.safeParse({ lines: lines(1, meta), couponCode: 'X' })
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(checkoutLinesRefusal(parsed.error)).toBe(CHECKOUT_LINE_META_TOO_LARGE_MESSAGE)
  })

  it('leaves any other refusal to the route', () => {
    const parsed = Body.safeParse({ lines: lines(1), couponCode: '' })
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(checkoutLinesRefusal(parsed.error)).toBeNull()
  })
})
