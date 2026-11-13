import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }))

import { Prisma } from '@prisma/client'
import { summariseMemberSales } from '@/modules/shop/lib/member-sales'

describe('summariseMemberSales', () => {
  it('reads an empty account as all zeroes, not NaN', () => {
    const s = summariseMemberSales(undefined, null)
    expect(s).toMatchObject({ paidOrders: 0, netSpend: '0.00', refunded: '0.00', averageOrderValue: '0.00', owedOrders: 0, owedTotal: '0.00', guestOrders: 0 })
    expect(s.firstOrderAt).toBeNull()
  })

  it('takes completed refunds off lifetime spend and averages the net', () => {
    const s = summariseMemberSales(
      { paid_orders: BigInt(3), gross: new Prisma.Decimal('300.00'), owed_orders: BigInt(1), owed_total: '49.99', guest_orders: BigInt(2), first_order_at: null, last_order_at: null },
      '60.00',
    )
    expect(s.netSpend).toBe('240.00')
    expect(s.refunded).toBe('60.00')
    expect(s.averageOrderValue).toBe('80.00')
    expect(s.owedOrders).toBe(1)
    expect(s.owedTotal).toBe('49.99')
    expect(s.guestOrders).toBe(2)
  })

  it('never shows a negative spend when refunds outrun what was paid', () => {
    const s = summariseMemberSales({ paid_orders: BigInt(1), gross: '100.00', owed_orders: null, owed_total: null, guest_orders: null, first_order_at: null, last_order_at: null }, '120.00')
    expect(s.netSpend).toBe('0.00')
    expect(s.averageOrderValue).toBe('0.00')
  })
})
