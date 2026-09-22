import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSiteTimezone } from '@/lib/config/timezone.server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listCoupons, createCoupon } from '@/modules/shop/lib/db'
import { DiscountWindowInput, discountExpiryInstant, discountWindowInstant, withDiscountWindowDays } from '@/modules/shop/lib/discount-window'

export async function GET() {
  const gate = await requireShopUser('shop.discounts', { allowAccess: true })
  if (gate.error) return gate.error
  // Each row carries its start day and last day as the form shows them, worked
  // out in the site's timezone - see lib/discount-window.ts.
  const [coupons, timezone] = await Promise.all([listCoupons(), getSiteTimezone()])
  return NextResponse.json({ coupons: coupons.map((c) => withDiscountWindowDays(c, timezone)) })
}

const Body = z.object({
  code: z.string().min(1),
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING']),
  value: z.number().nonnegative().nullable().optional(),
  minimumOrderValue: z.number().nonnegative().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  perCustomerLimit: z.number().int().positive().nullable().optional(),
  startsAt: DiscountWindowInput.nullable().optional(),
  // A bare day here is the LAST day the code works; a full instant is kept as sent.
  expiresAt: DiscountWindowInput.nullable().optional(),
})

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.discounts')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid coupon' }, { status: 400 })
  const timezone = await getSiteTimezone()
  const { id } = await createCoupon({
    ...parsed.data,
    code: parsed.data.code.toUpperCase(),
    startsAt: discountWindowInstant(parsed.data.startsAt, timezone),
    expiresAt: discountExpiryInstant(parsed.data.expiresAt, timezone),
  })
  return NextResponse.json({ id }, { status: 201 })
}
