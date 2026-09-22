import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ShpAutomaticDiscount, ShpCoupon } from '@/modules/shop/lib/types'

// How a coupon and the automatic rules stack, and which figure each threshold
// reads. The rule is written out above resolveDiscounts; these pin it, because
// the failure is quiet - free delivery handed to a basket a coupon has already
// taken under the line, or a minimum measured after its own discount so the
// offer can never be used - and nothing on the order looks wrong afterwards.

const coupons = vi.hoisted(() => vi.fn())
const autos = vi.hoisted(() => vi.fn())
const priorUses = vi.hoisted(() => vi.fn())

vi.mock('@/modules/shop/lib/db/discounts', () => ({ getCouponByCode: coupons, listAutomaticDiscounts: autos }))
vi.mock('@/modules/shop/lib/db/orders', () => ({ countPriorCouponOrdersByEmail: priorUses }))
vi.mock('@/modules/shop/lib/config', () => ({ getShopConfigCached: async () => ({ currencySymbol: '£' }) }))

const { resolveDiscounts } = await import('@/modules/shop/lib/checkout')

const EPOCH = new Date('2026-01-01T00:00:00Z')

const coupon = (over: Partial<ShpCoupon> = {}): ShpCoupon => ({
  id: 'c1',
  code: 'SAVE',
  type: 'FIXED_AMOUNT',
  value: '30.00',
  minimumOrderValue: null,
  usageLimit: null,
  usageCount: 0,
  perCustomerLimit: null,
  startsAt: null,
  expiresAt: null,
  isActive: true,
  createdAt: EPOCH,
  updatedAt: EPOCH,
  ...over,
})

const auto = (over: Partial<ShpAutomaticDiscount> = {}): ShpAutomaticDiscount => ({
  id: 'a1',
  name: 'Rule',
  type: 'PERCENTAGE',
  value: '10',
  minimumOrderValue: null,
  freeShippingThreshold: null,
  startsAt: null,
  expiresAt: null,
  isActive: true,
  priority: 0,
  createdAt: EPOCH,
  updatedAt: EPOCH,
  ...over,
})

beforeEach(() => {
  coupons.mockReset()
  autos.mockReset().mockResolvedValue([])
  priorUses.mockReset().mockResolvedValue(0)
})

describe('free-shipping thresholds read the discounted goods', () => {
  // The audit's own case: a £30 coupon takes a £110 basket to £80, and a rule
  // offering free delivery over £100 used to look at the £110 and hand it over.
  it('is not reached once a coupon takes the basket under it', async () => {
    coupons.mockResolvedValue(coupon())
    autos.mockResolvedValue([auto({ type: 'FREE_SHIPPING', value: null, freeShippingThreshold: '100.00' })])
    const res = await resolveDiscounts(110, 'SAVE', null)
    expect(res.discountAmount).toBe(30)
    expect(res.freeShipping).toBe(false)
  })

  it('is still reached when the coupon leaves enough', async () => {
    coupons.mockResolvedValue(coupon({ value: '10.00' }))
    autos.mockResolvedValue([auto({ type: 'FREE_SHIPPING', value: null, freeShippingThreshold: '100.00' })])
    expect((await resolveDiscounts(110, 'SAVE', null)).freeShipping).toBe(true)
  })

  // The admin form only offers a threshold on a free-shipping rule, and that
  // rule used to grant free shipping to every basket regardless of it.
  it('holds a free-shipping rule back until its threshold is met', async () => {
    autos.mockResolvedValue([auto({ type: 'FREE_SHIPPING', value: null, freeShippingThreshold: '100.00' })])
    expect((await resolveDiscounts(60, null, null)).freeShipping).toBe(false)
    expect((await resolveDiscounts(100, null, null)).freeShipping).toBe(true)
  })

  it('gives free shipping outright on a rule with no threshold', async () => {
    autos.mockResolvedValue([auto({ type: 'FREE_SHIPPING', value: null })])
    expect((await resolveDiscounts(5, null, null)).freeShipping).toBe(true)
  })

  it('reads the figure after higher-priority rules too', async () => {
    autos.mockResolvedValue([
      auto({ id: 'a1', priority: 10, type: 'PERCENTAGE', value: '20' }),
      auto({ id: 'a2', priority: 0, type: 'FREE_SHIPPING', value: null, freeShippingThreshold: '100.00' }),
    ])
    // £120 less 20% is £96: under the line.
    const res = await resolveDiscounts(120, null, null)
    expect(res.discountAmount).toBe(24)
    expect(res.freeShipping).toBe(false)
  })

  it('is not missed over a floating-point crumb at exactly the threshold', async () => {
    // £128.01 less £28.01 is 99.99999999999999 in floating point. The shopper
    // is paying £100.00 for the goods, and £100.00 is over the line.
    coupons.mockResolvedValue(coupon({ value: '28.01' }))
    autos.mockResolvedValue([auto({ type: 'FREE_SHIPPING', value: null, freeShippingThreshold: '100.00' })])
    expect((await resolveDiscounts(128.01, 'SAVE', null)).freeShipping).toBe(true)
  })
})

describe('minimum order values read the basket before their own discount', () => {
  it('lets "£10 off orders over £50" be used on a £55 basket', async () => {
    coupons.mockResolvedValue(coupon({ value: '10.00', minimumOrderValue: '50.00' }))
    const res = await resolveDiscounts(55, 'SAVE', null)
    expect(res.error).toBeUndefined()
    expect(res.discountAmount).toBe(10)
  })

  it('refuses the coupon under its minimum', async () => {
    coupons.mockResolvedValue(coupon({ value: '10.00', minimumOrderValue: '50.00' }))
    const res = await resolveDiscounts(45, 'SAVE', null)
    expect(res.error).toMatch(/Minimum order value/)
    expect(res.discountAmount).toBe(0)
  })

  it('lets an automatic rule qualify on its own discount-free figure', async () => {
    autos.mockResolvedValue([auto({ value: '10', minimumOrderValue: '100.00' })])
    expect((await resolveDiscounts(100, null, null)).discountAmount).toBe(10)
  })

  // The coupon is weighed first, so an automatic rule reads what it left - the
  // same rule as the coupon's own minimum, one step further down the list.
  it('measures an automatic rule after the coupon', async () => {
    coupons.mockResolvedValue(coupon({ value: '20.00' }))
    autos.mockResolvedValue([auto({ value: '10', minimumOrderValue: '100.00' })])
    const res = await resolveDiscounts(110, 'SAVE', null)
    expect(res.discountAmount).toBe(20)
  })

  it('does not refuse an automatic minimum over a floating-point crumb', async () => {
    coupons.mockResolvedValue(coupon({ value: '28.01' }))
    autos.mockResolvedValue([auto({ type: 'FIXED_AMOUNT', value: '5.00', minimumOrderValue: '100.00' })])
    expect((await resolveDiscounts(128.01, 'SAVE', null)).discountAmount).toBe(33.01)
  })

  it('stacks both when the basket clears every minimum', async () => {
    coupons.mockResolvedValue(coupon({ value: '20.00', minimumOrderValue: '100.00' }))
    autos.mockResolvedValue([auto({ value: '10', minimumOrderValue: '100.00' })])
    // £150: coupon (£20) -> £130, which clears the rule's £100 -> 10% of £130.
    const res = await resolveDiscounts(150, 'SAVE', null)
    expect(res.discountAmount).toBe(33)
  })
})

describe('thresholds the owner cannot see', () => {
  // The form offers the free-delivery box on a free-shipping rule only, but keeps
  // the figure when the rule is switched to another type. That leftover used to
  // hand "10% off" free delivery as well, with nothing on screen to say so.
  it('ignores a free-shipping threshold left on a percentage rule', async () => {
    autos.mockResolvedValue([auto({ type: 'PERCENTAGE', value: '10', freeShippingThreshold: '50.00' })])
    const result = await resolveDiscounts(200, null, null)
    expect(result.freeShipping).toBe(false)
    expect(result.discountAmount).toBe(20)
  })

  it('names the currency when a coupon minimum is not met', async () => {
    coupons.mockResolvedValue(coupon({ minimumOrderValue: '1500.00' }))
    const result = await resolveDiscounts(100, 'SAVE', null)
    expect(result.error).toBe('Minimum order value for this coupon is £1,500.00')
  })
})

describe('free-delivery thresholds read every discount', () => {
  it('judges the threshold after lower-priority discounts too', () => {
    autos.mockResolvedValue([
      auto({ id: 'free', priority: 10, type: 'FREE_SHIPPING', value: null, freeShippingThreshold: '100.00' }),
      auto({ id: 'ten', priority: 0, type: 'PERCENTAGE', value: '10' }),
    ])
    // £105 less 10% is £94.50 - under the £100 line whatever order the rules run in.
    return resolveDiscounts(105, null, null).then((result) => {
      expect(result.discountAmount).toBe(10.5)
      expect(result.freeShipping).toBe(false)
    })
  })
})
