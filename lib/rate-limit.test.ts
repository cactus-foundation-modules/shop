import { describe, it, expect } from 'vitest'
import { getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'

describe('getClientIpFromRequest (deprecated)', () => {
  it('reads the last x-forwarded-for hop, not the one the caller typed', () => {
    const req = new Request('https://example.test', { headers: { 'x-forwarded-for': '9.9.9.9, 203.0.113.7' } })
    expect(getClientIpFromRequest(req)).toBe('203.0.113.7')
  })

  it('does not believe cf-connecting-ip on its own', () => {
    const req = new Request('https://example.test', { headers: { 'cf-connecting-ip': '9.9.9.9', 'x-real-ip': '203.0.113.8' } })
    expect(getClientIpFromRequest(req)).toBe('203.0.113.8')
  })
})
