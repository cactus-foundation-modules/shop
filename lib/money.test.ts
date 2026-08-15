import { describe, expect, it } from 'vitest'
import { formatMoney } from '@/modules/shop/lib/money'

describe('formatMoney', () => {
  it('prints two decimal places', () => {
    expect(formatMoney(7.99)).toBe('£7.99')
    expect(formatMoney(7.9)).toBe('£7.90')
    expect(formatMoney(7)).toBe('£7.00')
  })

  it('groups thousands - the reason this changed', () => {
    expect(formatMoney(1600)).toBe('£1,600.00')
    expect(formatMoney(12345.5)).toBe('£12,345.50')
  })

  it('leaves three figures alone', () => {
    expect(formatMoney(999.99)).toBe('£999.99')
  })

  it('takes the decimal strings the query layer hands it', () => {
    expect(formatMoney('1600.00')).toBe('£1,600.00')
    expect(formatMoney('484')).toBe('£484.00')
  })

  it('honours a shop on another currency', () => {
    expect(formatMoney(1600, '$')).toBe('$1,600.00')
    expect(formatMoney(1600, '')).toBe('1,600.00')
  })

  it('treats nothing and nonsense as zero rather than printing NaN', () => {
    expect(formatMoney(null)).toBe('£0.00')
    expect(formatMoney(undefined)).toBe('£0.00')
    expect(formatMoney('')).toBe('£0.00')
    expect(formatMoney('not a price')).toBe('£0.00')
  })

  it('handles a negative (a refund line)', () => {
    expect(formatMoney(-1600)).toBe('£-1,600.00')
  })

  // Pinned to en-GB on purpose: the same call runs on the server and again in
  // the browser, and a runtime defaulting to another locale would render
  // "1.600,00" server-side and "1,600.00" client-side - a hydration mismatch on
  // every price in the shop.
  it('does not follow the runtime locale', () => {
    expect(formatMoney(1600)).toContain(',')
    expect(formatMoney(1600).endsWith('.00')).toBe(true)
  })
})
