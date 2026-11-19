import { describe, expect, it } from 'vitest'
import { pickAwaitingRequest } from '@/modules/shop/lib/issue-photo-inbound'

const ask = (orderNumber: string, at: string) => ({
  requestId: `req-${orderNumber}`,
  orderId: `ord-${orderNumber}`,
  orderNumber,
  photosRequestedAt: new Date(at),
})

const email = (subject: string, sentAt = '2026-11-19T12:00:00Z', bodyText = '') => ({ subject, bodyText, sentAt })

describe('matching an emailed reply to the report waiting on photographs', () => {
  it('takes the only report waiting', () => {
    const picked = pickAwaitingRequest([ask('DW000182', '2026-11-18T09:00:00Z')], email('Re: Could you send us a photograph?'))
    expect(picked && 'found' in picked && picked.found.orderNumber).toBe('DW000182')
  })

  it('picks the order the subject names when there are several', () => {
    const picked = pickAwaitingRequest(
      [ask('DW000190', '2026-11-18T10:00:00Z'), ask('DW000182', '2026-11-18T09:00:00Z')],
      email('Re: Could you send us a photograph? Order DW000182'),
    )
    expect(picked && 'found' in picked && picked.found.orderNumber).toBe('DW000182')
  })

  it('finds the order number in the quoted text too', () => {
    const picked = pickAwaitingRequest(
      [ask('DW000190', '2026-11-18T10:00:00Z'), ask('DW000182', '2026-11-18T09:00:00Z')],
      email('photos', '2026-11-19T12:00:00Z', '> Thanks for your report about order dw000182.'),
    )
    expect(picked && 'found' in picked && picked.found.orderNumber).toBe('DW000182')
  })

  it('refuses to guess between several reports when nothing names one', () => {
    const picked = pickAwaitingRequest(
      [ask('DW000190', '2026-11-18T10:00:00Z'), ask('DW000182', '2026-11-18T09:00:00Z')],
      email('photos'),
    )
    expect(picked && 'reason' in picked).toBe(true)
  })

  it('ignores an email written before the photographs were asked for', () => {
    expect(pickAwaitingRequest([ask('DW000182', '2026-11-19T12:00:00Z')], email('photos', '2026-11-17T12:00:00Z'))).toBeNull()
  })
})
