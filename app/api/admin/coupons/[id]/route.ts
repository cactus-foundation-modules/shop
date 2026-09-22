import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSiteTimezone } from '@/lib/config/timezone.server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { updateCoupon, deleteCoupon } from '@/modules/shop/lib/db'
import { DiscountWindowInput, discountExpiryInstant, discountWindowInstant } from '@/modules/shop/lib/discount-window'

const Body = z.object({
  code: z.string().min(1).optional(),
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING']).optional(),
  value: z.number().nonnegative().nullable().optional(),
  minimumOrderValue: z.number().nonnegative().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  perCustomerLimit: z.number().int().positive().nullable().optional(),
  startsAt: DiscountWindowInput.nullable().optional(),
  // A bare day here is the LAST day the code works; a full instant is kept as sent.
  expiresAt: DiscountWindowInput.nullable().optional(),
  isActive: z.boolean().optional(),
})

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.discounts')
  if (gate.error) return gate.error
  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid coupon' }, { status: 400 })
  const { code, startsAt, expiresAt, ...rest } = parsed.data
  const timezone = await getSiteTimezone()
  await updateCoupon(id, {
    ...rest,
    ...(code ? { code: code.toUpperCase() } : {}),
    startsAt: discountWindowInstant(startsAt, timezone),
    expiresAt: discountExpiryInstant(expiresAt, timezone),
  })
  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.discounts')
  if (gate.error) return gate.error
  const { id } = await params
  await deleteCoupon(id)
  return NextResponse.json({ success: true })
}
