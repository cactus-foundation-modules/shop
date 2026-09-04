import { beforeAll, describe, expect, it, vi } from 'vitest'
import { grantGuestOrderAccess, readGuestOrderAccessValue } from '@/modules/shop/lib/guest-order-access'
import type { NextResponse } from 'next/server'

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a-test-key-that-is-at-least-32-characters-long'
})

// grantGuestOrderAccess only ever touches response.cookies.set, so the whole of
// NextResponse it needs is that one method. Captures the value it wrote so the
// reader can be pointed back at it - the pair is the only thing worth testing
// here, since a cookie that signs and a cookie that verifies are no use apart.
function captureGrant(orderId: string, existing: string[]): string {
  let written = ''
  const response = {
    cookies: { set: (_name: string, value: string) => { written = value } },
  } as unknown as NextResponse
  grantGuestOrderAccess(response, orderId, existing)
  return written
}

describe('guest order access cookie', () => {
  it('reads back the order it granted', () => {
    expect(readGuestOrderAccessValue(captureGrant('order-1', []))).toEqual(['order-1'])
  })

  it('keeps orders proved earlier, newest first', () => {
    const value = captureGrant('order-3', ['order-2', 'order-1'])
    expect(readGuestOrderAccessValue(value)).toEqual(['order-3', 'order-2', 'order-1'])
  })

  it('does not list the same order twice', () => {
    const value = captureGrant('order-1', ['order-2', 'order-1'])
    expect(readGuestOrderAccessValue(value)).toEqual(['order-1', 'order-2'])
  })

  it('drops the least recently proved past the limit', () => {
    const existing = Array.from({ length: 10 }, (_, i) => `old-${i}`)
    const ids = readGuestOrderAccessValue(captureGrant('new', existing))
    expect(ids).toHaveLength(10)
    expect(ids[0]).toBe('new')
    expect(ids).not.toContain('old-9')
  })

  // The whole security of it: the list is only worth anything because it cannot
  // be edited by the browser holding it.
  it('refuses a list somebody has added an order to', () => {
    const value = captureGrant('order-1', [])
    const [payload, signature] = value.split('.')
    const tampered = Buffer.from(JSON.stringify({
      o: ['order-1', 'someone-elses-order'],
      e: JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')).e,
    }), 'utf8').toString('base64url')
    expect(readGuestOrderAccessValue(`${tampered}.${signature}`)).toEqual([])
  })

  it('refuses rubbish rather than throwing', () => {
    expect(readGuestOrderAccessValue('')).toEqual([])
    expect(readGuestOrderAccessValue(null)).toEqual([])
    expect(readGuestOrderAccessValue('not-a-cookie')).toEqual([])
    expect(readGuestOrderAccessValue('.....')).toEqual([])
  })

  it('stops honouring a grant once it has expired', () => {
    const value = captureGrant('order-1', [])
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(Date.now() + 31 * 24 * 60 * 60 * 1000))
      expect(readGuestOrderAccessValue(value)).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })
})
