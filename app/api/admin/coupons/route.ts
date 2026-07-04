import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listCoupons, createCoupon } from '@/modules/shop/lib/db'

export async function GET() {
  const gate = await requireShopUser('shop.discounts', { allowAccess: true })
  if (gate.error) return gate.error
  const coupons = await listCoupons()
  return NextResponse.json({ coupons })
}

const Body = z.object({
  code: z.string().min(1),
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING']),
  value: z.number().nonnegative().nullable().optional(),
  minimumOrderValue: z.number().nonnegative().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  perCustomerLimit: z.number().int().positive().nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
})

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.discounts')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid coupon' }, { status: 400 })
  const { id } = await createCoupon({ ...parsed.data, code: parsed.data.code.toUpperCase() })
  return NextResponse.json({ id }, { status: 201 })
}
