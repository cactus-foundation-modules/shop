import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { summariseRevenue } from '@/modules/shop/lib/dashboard-revenue'

describe('summariseRevenue', () => {
  it('reads an empty month as nothing, not as an error', () => {
    expect(summariseRevenue(undefined)).toEqual({ revenue: '0.00', orderCount: 0, averageOrderValue: '0.00' })
    expect(summariseRevenue({ revenue: null, sale_revenue: null, order_count: 0n })).toEqual({
      revenue: '0.00', orderCount: 0, averageOrderValue: '0.00',
    })
  })

  it('keeps a charged spare in the revenue and out of the average', () => {
    // Three sales worth £300 between them, and a £48 spare the customer paid for.
    const summary = summariseRevenue({ revenue: new Prisma.Decimal('348.00'), sale_revenue: new Prisma.Decimal('300.00'), order_count: 3n })
    expect(summary.revenue).toBe('348.00')
    expect(summary.orderCount).toBe(3)
    expect(summary.averageOrderValue).toBe('100.00')
  })

  it('divides in decimal, rounding to the penny', () => {
    // £100 over three orders is £33.333...; a float gets there too, but a sum
    // like 0.1 + 0.2 is where floats stop agreeing with the report.
    expect(summariseRevenue({ revenue: '100.00', sale_revenue: '100.00', order_count: 3 }).averageOrderValue).toBe('33.33')
    expect(summariseRevenue({ revenue: '0.30', sale_revenue: '0.30', order_count: 1 }).averageOrderValue).toBe('0.30')
    expect(summariseRevenue({ revenue: '20.05', sale_revenue: '20.05', order_count: 2 }).averageOrderValue).toBe('10.03')
  })

  it('carries a large month exactly', () => {
    expect(summariseRevenue({ revenue: '12345678.91', sale_revenue: '12345678.91', order_count: 7n }).revenue).toBe('12345678.91')
  })
})
