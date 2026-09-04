import { describe, it, expect } from 'vitest'
import { dispatchDetails } from '@/modules/shop/lib/order-status'

const NONE = { trackingUrl: '', trackingLinks: '' }

describe('dispatchDetails', () => {
  it('quotes the number and the courier of a single parcel', () => {
    expect(dispatchDetails([{ trackingNumber: 'AB123', carrier: 'DPD' }]))
      .toEqual({ trackingNumber: 'AB123', carrier: 'DPD', ...NONE })
  })

  // The customer being told the whole order is on its way wants every number,
  // not whichever parcel happened to be recorded first.
  it('joins every parcel that has one', () => {
    expect(dispatchDetails([
      { trackingNumber: 'AB123', carrier: 'DPD' },
      { trackingNumber: 'CD456', carrier: 'DPD' },
    ])).toEqual({ trackingNumber: 'AB123, CD456', carrier: 'DPD', ...NONE })
  })

  it('ignores parcels with nothing recorded against them', () => {
    expect(dispatchDetails([
      { trackingNumber: null, carrier: null },
      { trackingNumber: '  ', carrier: 'Royal Mail' },
      { trackingNumber: 'AB123', carrier: null },
    ])).toEqual({ trackingNumber: 'AB123', carrier: 'Royal Mail', ...NONE })
  })

  // Empty strings, so the template's {{#if}} drops the line rather than
  // printing "Tracking number:" and then nothing.
  it('gives back empty strings when nothing was recorded at all', () => {
    expect(dispatchDetails([{ trackingNumber: null, carrier: null }]))
      .toEqual({ trackingNumber: '', carrier: '', ...NONE })
    expect(dispatchDetails([])).toEqual({ trackingNumber: '', carrier: '', ...NONE })
  })
})

describe('dispatchDetails - tracking links', () => {
  it('labels a parcel link with its own tracking number', () => {
    const out = dispatchDetails([{ trackingNumber: 'AB123', trackingUrl: 'https://dpd.test/AB123', carrier: 'DPD' }])
    expect(out.trackingLinks).toContain('href="https://dpd.test/AB123"')
    expect(out.trackingLinks).toContain('Track AB123')
  })

  it('falls back to a plain label for a link with no number beside it', () => {
    const out = dispatchDetails([{ trackingNumber: null, trackingUrl: 'https://dpd.test/x', carrier: null }])
    expect(out.trackingLinks).toContain('Track your parcel')
  })

  // A single {{trackingUrl}} in somebody's own wording is one anchor. Three
  // parcels are three, and a lone anchor would point at the wrong one.
  it('fills the single url only when there is exactly one', () => {
    expect(dispatchDetails([{ trackingNumber: 'A', trackingUrl: 'https://a.test/1', carrier: null }]).trackingUrl)
      .toBe('https://a.test/1')
    expect(dispatchDetails([
      { trackingNumber: 'A', trackingUrl: 'https://a.test/1', carrier: null },
      { trackingNumber: 'B', trackingUrl: 'https://a.test/2', carrier: null },
    ]).trackingUrl).toBe('')
  })

  it('gives every parcel its own line when there are several', () => {
    const out = dispatchDetails([
      { trackingNumber: 'A', trackingUrl: 'https://a.test/1', carrier: null },
      { trackingNumber: 'B', trackingUrl: 'https://a.test/2', carrier: null },
    ])
    expect(out.trackingLinks.match(/<a /g)?.length).toBe(2)
  })

  it('does not repeat one link recorded against two parcels', () => {
    const out = dispatchDetails([
      { trackingNumber: 'A', trackingUrl: 'https://a.test/1', carrier: null },
      { trackingNumber: 'B', trackingUrl: 'https://a.test/1', carrier: null },
    ])
    expect(out.trackingLinks.match(/<a /g)?.length).toBe(1)
    expect(out.trackingUrl).toBe('https://a.test/1')
  })

  // The value ends up as an href in front of somebody who trusts the sender.
  // The dispatch route refuses these, but a row written before that check
  // existed has never been past it.
  it('drops anything that is not an http or https link', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'ftp://a.test/1', 'not a url', '  ']) {
      const out = dispatchDetails([{ trackingNumber: 'A', trackingUrl: url, carrier: null }])
      expect(out.trackingLinks, url).toBe('')
      expect(out.trackingUrl, url).toBe('')
    }
  })

  it('escapes what it puts in the markup', () => {
    const out = dispatchDetails([{ trackingNumber: 'A&B"<x>', trackingUrl: 'https://a.test/?a=1&b=2', carrier: null }])
    expect(out.trackingLinks).toContain('&amp;b=2')
    expect(out.trackingLinks).not.toContain('<x>')
  })
})
