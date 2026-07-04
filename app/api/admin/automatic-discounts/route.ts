import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listAutomaticDiscounts, createAutomaticDiscount } from '@/modules/shop/lib/db'

export async function GET() {
  const gate = await requireShopUser('shop.discounts', { allowAccess: true })
  if (gate.error) return gate.error
  const discounts = await listAutomaticDiscounts()
  return NextResponse.json({ discounts })
}

const Body = z.object({
  name: z.string().min(1),
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING']),
  value: z.number().nonnegative().nullable().optional(),
  minimumOrderValue: z.number().nonnegative().nullable().optional(),
  freeShippingThreshold: z.number().nonnegative().nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  priority: z.number().int().optional(),
})

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.discounts')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid discount' }, { status: 400 })
  const { id } = await createAutomaticDiscount(parsed.data)
  return NextResponse.json({ id }, { status: 201 })
}
