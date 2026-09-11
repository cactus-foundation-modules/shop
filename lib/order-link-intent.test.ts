import { describe, it, expect } from 'vitest'
import { orderLinkIntentQuery, orderLinkIntentSet } from '@/modules/shop/lib/order-link-intent'
import { REPORT_ISSUE_QUERY_KEY, reportIssueUrl } from '@/modules/shop/lib/order-requests'

// The bug all of this exists for: every order link in every email points at the
// tracking page, and the tracking page threw the query string away on both of
// its ways out. A link that asked for something therefore arrived asking for
// nothing, and the delivery email's "questions about your delivery" link had
// never once opened the questions.

describe('reportIssueUrl', () => {
  it('adds the report switch to a plain order link', () => {
    expect(reportIssueUrl('https://shop.example/shop/track-order/DW1')).toBe(
      'https://shop.example/shop/track-order/DW1?report=1',
    )
  })

  // The reason it parses rather than appends: a guest's link already carries a
  // token, and a second "?" makes an address that opens nothing and proves
  // nothing.
  it('keeps the tracking token that is already on the link', () => {
    const url = new URL(reportIssueUrl('https://shop.example/shop/track-order/DW1?t=abc123'))
    expect(url.searchParams.get('t')).toBe('abc123')
    expect(url.searchParams.get(REPORT_ISSUE_QUERY_KEY)).toBe('1')
  })

  it('is empty for a shop with no order link to send anybody to', () => {
    expect(reportIssueUrl('')).toBe('')
    expect(reportIssueUrl('not a url')).toBe('')
  })
})

describe('orderLinkIntentQuery', () => {
  it('carries the keys the link actually asked for', () => {
    expect(orderLinkIntentQuery({ report: '1' })).toBe('?report=1')
    expect(orderLinkIntentQuery({ faq: '1' })).toBe('?faq=1')
    expect(orderLinkIntentQuery({ faq: '1', report: '1' })).toBe('?faq=1&report=1')
  })

  it('is empty for a link that only asked to be let in', () => {
    expect(orderLinkIntentQuery({})).toBe('')
    expect(orderLinkIntentQuery({ t: 'abc123' })).toBe('')
  })

  // An allowlist, not a forward. What arrives is somebody else's URL, and
  // passing the lot through would let a crafted link put arbitrary query onto
  // the authenticated page on the other side of the postcode gate.
  it('drops everything it was not asked to carry', () => {
    expect(orderLinkIntentQuery({ t: 'abc', next: '//evil.example', faq: '1' })).toBe('?faq=1')
  })

  it('passes on the switch rather than the value it arrived with', () => {
    expect(orderLinkIntentQuery({ report: 'yes' })).toBe('')
    expect(orderLinkIntentQuery({ report: ['1', '2'] })).toBe('?report=1')
  })
})

describe('orderLinkIntentSet', () => {
  it('reads one switch off the page its own query string', () => {
    expect(orderLinkIntentSet({ report: '1' }, REPORT_ISSUE_QUERY_KEY)).toBe(true)
    expect(orderLinkIntentSet({ report: ['1'] }, REPORT_ISSUE_QUERY_KEY)).toBe(true)
    expect(orderLinkIntentSet({ report: '0' }, REPORT_ISSUE_QUERY_KEY)).toBe(false)
    expect(orderLinkIntentSet({}, REPORT_ISSUE_QUERY_KEY)).toBe(false)
  })
})
