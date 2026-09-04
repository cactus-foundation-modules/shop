import { beforeAll, describe, expect, it } from 'vitest'
import {
  orderTrackingBasePath,
  orderTrackingPath,
  orderTrackingRootSlug,
  orderTrackingUrl,
  signOrderTrackingToken,
  verifyOrderTrackingToken,
} from '@/modules/shop/lib/order-tracking'

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a-test-key-that-is-at-least-32-characters-long'
  process.env.SITE_URL = 'https://example.com'
})

const ON = { guestOrderTrackingEnabled: true, orderTrackingRootSlug: 'track-order' }

describe('tracking token', () => {
  it('verifies the token it issued', () => {
    expect(verifyOrderTrackingToken('DW000172', signOrderTrackingToken('DW000172'))).toBe(true)
  })

  it("refuses another order's token", () => {
    expect(verifyOrderTrackingToken('DW000173', signOrderTrackingToken('DW000172'))).toBe(false)
  })

  it('refuses nothing, and rubbish, rather than throwing', () => {
    expect(verifyOrderTrackingToken('DW000172', null)).toBe(false)
    expect(verifyOrderTrackingToken('DW000172', '')).toBe(false)
    expect(verifyOrderTrackingToken('DW000172', 'not-a-token')).toBe(false)
    expect(verifyOrderTrackingToken('', signOrderTrackingToken(''))).toBe(false)
  })

  // Every token in this module has its own namespace so that a shop whose
  // documents share a number prefix cannot find one opening another.
  it('is not the receipt token for the same order', async () => {
    const { signOrderReceiptToken } = await import('@/modules/shop/lib/order-receipt-token')
    expect(signOrderTrackingToken('DW000172')).not.toBe(signOrderReceiptToken('DW000172'))
  })
})

describe('root slug', () => {
  it('takes an ordinary slug', () => {
    expect(orderTrackingRootSlug(ON)).toBe('track-order')
    expect(orderTrackingRootSlug({ ...ON, orderTrackingRootSlug: '  Track-Order ' })).toBe('track-order')
  })

  it('is nothing at all when guest tracking is off', () => {
    expect(orderTrackingRootSlug({ ...ON, guestOrderTrackingEnabled: false })).toBeNull()
  })

  // The value ends up in a URL and in a comparison against every bare slug on
  // the site, so anything that is not one plain segment turns the root address
  // off rather than claiming something surprising.
  it('refuses anything that is not one plain segment', () => {
    for (const bad of ['', '   ', 'track order', 'track/order', '/track-order', '-track', 'track-', 'trck?x=1']) {
      expect(orderTrackingRootSlug({ ...ON, orderTrackingRootSlug: bad }), bad).toBeNull()
    }
  })
})

describe('addresses', () => {
  it("sends somebody looking an order up to the owner's own front door", () => {
    expect(orderTrackingBasePath(ON)).toBe('/track-order')
    expect(orderTrackingBasePath({ ...ON, orderTrackingRootSlug: '' })).toBe('/shop/track-order')
  })

  // The link in an email never uses the root slug: core hands a module the bare
  // slug and nothing after it, so /track-order/DW000172 is not an address the
  // shop can promise to answer for the next several years.
  it('always links an order under /shop/track-order', () => {
    const path = orderTrackingPath('DW000172')
    expect(path.startsWith('/shop/track-order/DW000172?t=')).toBe(true)
    expect(verifyOrderTrackingToken('DW000172', new URL(path, 'https://x').searchParams.get('t'))).toBe(true)
  })

  it('makes an absolute address for an email', () => {
    expect(orderTrackingUrl('DW000172', ON).startsWith('https://example.com/shop/track-order/DW000172?t=')).toBe(true)
  })

  // Empty rather than throwing, because it goes straight into a merge tag and a
  // tag nothing fills collapses to nothing - which takes the whole line with it.
  it('has no link to offer on a shop with tracking switched off', () => {
    expect(orderTrackingUrl('DW000172', { ...ON, guestOrderTrackingEnabled: false })).toBe('')
  })
})
