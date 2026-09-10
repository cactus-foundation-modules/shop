import { beforeAll, describe, expect, it, vi } from 'vitest'
import { grantReceiptAccess, readReceiptAccessValue } from '@/modules/shop/lib/receipt-access-cookie'
import { grantGuestOrderAccess, readGuestOrderAccessValue } from '@/modules/shop/lib/guest-order-access'
import type { NextRequest, NextResponse } from 'next/server'

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a-test-key-that-is-at-least-32-characters-long'
})

// Both grants only ever touch response.cookies.set, and both only ever read one
// cookie off the request, so those two are the whole of Next either of them
// needs. Captures the value written so the reader can be pointed back at it -
// a cookie that signs and a cookie that verifies are no use apart.
function captureGrant(orderNumber: string, existing: string): string {
  let written = ''
  const response = {
    cookies: { set: (_name: string, value: string) => { written = value } },
  } as unknown as NextResponse
  const request = {
    cookies: { get: () => (existing ? { value: existing } : undefined) },
  } as unknown as NextRequest
  grantReceiptAccess(response, orderNumber, request)
  return written
}

describe('receipt access cookie', () => {
  it('reads back the order it granted', () => {
    expect(readReceiptAccessValue(captureGrant('DW000188', ''))).toEqual(['DW000188'])
  })

  it('keeps receipts granted earlier, newest first', () => {
    const first = captureGrant('DW000188', '')
    expect(readReceiptAccessValue(captureGrant('DW000189', first))).toEqual(['DW000189', 'DW000188'])
  })

  it('does not list the same order twice', () => {
    const first = captureGrant('DW000188', '')
    expect(readReceiptAccessValue(captureGrant('DW000188', first))).toEqual(['DW000188'])
  })

  it('drops the least recently used past the limit', () => {
    let value = ''
    for (let i = 0; i < 12; i += 1) value = captureGrant(`DW00${100 + i}`, value)
    const numbers = readReceiptAccessValue(value)
    expect(numbers).toHaveLength(10)
    expect(numbers[0]).toBe('DW00111')
    expect(numbers).not.toContain('DW00100')
  })

  // The whole security of it: the list is only worth anything because it cannot
  // be edited by the browser holding it.
  it('refuses a list somebody has added an order to', () => {
    const value = captureGrant('DW000188', '')
    const [payload, signature] = value.split('.')
    const tampered = Buffer.from(JSON.stringify({
      o: ['DW000188', 'DW000001'],
      e: JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')).e,
    }), 'utf8').toString('base64url')
    expect(readReceiptAccessValue(`${tampered}.${signature}`)).toEqual([])
  })

  it('refuses rubbish rather than throwing', () => {
    expect(readReceiptAccessValue('')).toEqual([])
    expect(readReceiptAccessValue(null)).toEqual([])
    expect(readReceiptAccessValue('not-a-cookie')).toEqual([])
    expect(readReceiptAccessValue('.....')).toEqual([])
  })

  it('stops honouring a grant once it has expired', () => {
    const value = captureGrant('DW000188', '')
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000))
      expect(readReceiptAccessValue(value)).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  // The two cookies share a wire format and a signing key, and they grant very
  // different things - the receipt one is handed out at the till without anybody
  // proving anything, while the other opens a whole order page. Only the purpose
  // in the signature keeps them apart, so this is the test that matters.
  it('does not accept a cookie minted for the order page', () => {
    let written = ''
    const response = {
      cookies: { set: (_name: string, value: string) => { written = value } },
    } as unknown as NextResponse
    grantGuestOrderAccess(response, 'order-1', [])
    expect(readGuestOrderAccessValue(written)).toEqual(['order-1'])
    expect(readReceiptAccessValue(written)).toEqual([])
  })

  it('is not accepted by the order page either', () => {
    expect(readGuestOrderAccessValue(captureGrant('DW000188', ''))).toEqual([])
  })
})
