import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSiteTimezone } from '@/lib/config/timezone.server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { updateAutomaticDiscount, deleteAutomaticDiscount } from '@/modules/shop/lib/db'
import { DiscountWindowInput, discountExpiryInstant, discountWindowInstant } from '@/modules/shop/lib/discount-window'

const Body = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING']).optional(),
  value: z.number().nonnegative().nullable().optional(),
  minimumOrderValue: z.number().nonnegative().nullable().optional(),
  freeShippingThreshold: z.number().nonnegative().nullable().optional(),
  startsAt: DiscountWindowInput.nullable().optional(),
  // A bare day here is the LAST day the discount works; a full instant is kept as sent.
  expiresAt: DiscountWindowInput.nullable().optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.discounts')
  if (gate.error) return gate.error
  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid discount' }, { status: 400 })
  const { startsAt, expiresAt, ...rest } = parsed.data
  const timezone = await getSiteTimezone()
  await updateAutomaticDiscount(id, {
    ...rest,
    startsAt: discountWindowInstant(startsAt, timezone),
    expiresAt: discountExpiryInstant(expiresAt, timezone),
  })
  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.discounts')
  if (gate.error) return gate.error
  const { id } = await params
  await deleteAutomaticDiscount(id)
  return NextResponse.json({ success: true })
}
