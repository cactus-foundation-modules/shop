import { describe, expect, it, vi } from 'vitest'

// The link rule on its own. The module's other exports talk to the database
// and send mail, so those are stood in for - only the pure rule is under test.
vi.mock('@/modules/shop/lib/db/shipments', () => ({}))
vi.mock('@/modules/shop/lib/order-status', () => ({}))
vi.mock('@/modules/shop/lib/tracking-added-email', () => ({}))
vi.mock('@/modules/shop/lib/delivery-slot-email', () => ({}))
vi.mock('@/lib/config/timezone.server', () => ({}))

const { trackingLinkFor, WRONG_AIT_LINK } = await import('./dispatch-follow-up')

const config = {
  deliveryCouriers: [
    { id: 'ait', trackingSource: 'ait' },
    { id: 'other', trackingSource: 'none' },
  ],
} as never

describe('trackingLinkFor on an AIT courier', () => {
  it('keeps the short link in one shape, and clears any tracking number', () => {
    expect(trackingLinkFor(config, 'ait', 'aithd.com/kz0vkrz/')).toEqual({
      ok: true,
      link: { trackingUrl: 'https://aithd.com/kz0vkrz', trackingShortCode: null, trackingNumber: null },
    })
  })

  it('refuses the long address and anything else', () => {
    expect(trackingLinkFor(config, 'ait', 'https://aithd.com/11093/972140')).toEqual({ ok: false, error: WRONG_AIT_LINK })
    expect(trackingLinkFor(config, 'ait', 'https://example.com/kz0vkrz')).toEqual({ ok: false, error: WRONG_AIT_LINK })
  })

  it('clears the number even with no link yet', () => {
    expect(trackingLinkFor(config, 'ait', null)).toEqual({
      ok: true,
      link: { trackingUrl: null, trackingShortCode: null, trackingNumber: null },
    })
  })

  it('leaves every other courier as it was', () => {
    expect(trackingLinkFor(config, 'other', 'https://example.com/x')).toEqual({
      ok: true,
      link: { trackingUrl: 'https://example.com/x', trackingShortCode: null },
    })
  })
})
