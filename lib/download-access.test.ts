import { describe, it, expect } from 'vitest'
import { DOWNLOAD_LIMIT_REACHED, downloadRefusal } from '@/modules/shop/lib/download-access'

// The rule that decides whether somebody gets a file they paid for - or keep a
// file they were refunded for. Both mistakes are quiet: nobody complains about
// a download that works when it should not have.

const NOW = new Date('2026-09-21T12:00:00Z')
const download = { expiresAt: null, downloadCount: 0 }
const paidOrder = { status: 'PROCESSING' as const, paymentStatus: 'PAID' as const }
const line = { quantity: 1, refundedQty: 0 }

describe('downloadRefusal', () => {
  it('hands over the file on a paid order with nothing refunded', () => {
    expect(downloadRefusal({ download, order: paidOrder, item: line, downloadLimit: null, now: NOW })).toBeNull()
  })

  it('refuses a link whose order or line has gone', () => {
    expect(downloadRefusal({ download, order: null, item: line, downloadLimit: null, now: NOW })?.status).toBe(404)
    expect(downloadRefusal({ download, order: paidOrder, item: null, downloadLimit: null, now: NOW })?.status).toBe(404)
  })

  it('refuses an expired link', () => {
    const expired = { ...download, expiresAt: new Date('2026-09-20T12:00:00Z') }
    expect(downloadRefusal({ download: expired, order: paidOrder, item: line, downloadLimit: null, now: NOW })).toEqual({
      status: 410,
      message: 'This download link has expired.',
    })
  })

  it('refuses once the line itself has been refunded in full', () => {
    const refusal = downloadRefusal({ download, order: { ...paidOrder, status: 'PARTIALLY_REFUNDED' }, item: { quantity: 2, refundedQty: 2 }, downloadLimit: null, now: NOW })
    expect(refusal?.status).toBe(410)
    expect(refusal?.message).toMatch(/refunded/)
  })

  it('keeps working while some of the line is still bought', () => {
    expect(downloadRefusal({ download, order: { ...paidOrder, status: 'PARTIALLY_REFUNDED' }, item: { quantity: 2, refundedQty: 1 }, downloadLimit: null, now: NOW })).toBeNull()
  })

  it('refuses when the whole order was refunded at the provider, which never touches the line', () => {
    expect(downloadRefusal({ download, order: { ...paidOrder, status: 'REFUNDED' }, item: line, downloadLimit: null, now: NOW })?.status).toBe(410)
    expect(downloadRefusal({ download, order: { ...paidOrder, paymentStatus: 'REFUNDED' }, item: line, downloadLimit: null, now: NOW })?.status).toBe(410)
  })

  it('keeps working on a partly refunded order payment', () => {
    expect(downloadRefusal({ download, order: { ...paidOrder, paymentStatus: 'PARTIALLY_REFUNDED' }, item: line, downloadLimit: null, now: NOW })).toBeNull()
  })

  it('refuses a cancelled order', () => {
    const refusal = downloadRefusal({ download, order: { ...paidOrder, status: 'CANCELLED' }, item: line, downloadLimit: null, now: NOW })
    expect(refusal?.status).toBe(410)
    expect(refusal?.message).toMatch(/cancelled/)
  })

  it('holds the file back on an order that is no longer paid for, without calling it gone', () => {
    for (const paymentStatus of ['PENDING', 'FAILED', 'AWAITING_CONFIRMATION'] as const) {
      expect(downloadRefusal({ download, order: { ...paidOrder, paymentStatus }, item: line, downloadLimit: null, now: NOW })?.status).toBe(403)
    }
  })

  it('refuses at the limit and not before', () => {
    expect(downloadRefusal({ download: { ...download, downloadCount: 2 }, order: paidOrder, item: line, downloadLimit: 3, now: NOW })).toBeNull()
    expect(downloadRefusal({ download: { ...download, downloadCount: 3 }, order: paidOrder, item: line, downloadLimit: 3, now: NOW })).toEqual({
      status: 410,
      message: DOWNLOAD_LIMIT_REACHED,
    })
  })
})
