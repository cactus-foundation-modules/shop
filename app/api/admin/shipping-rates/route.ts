import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { createShippingRate } from '@/modules/shop/lib/db'

const Body = z.object({
  zoneId: z.string(),
  name: z.string().min(1),
  type: z.enum(['FLAT', 'WEIGHT_BASED', 'FREE']),
  flatRate: z.number().nonnegative().nullable().optional(),
  weightRates: z.array(z.object({ upToKg: z.number().positive(), rate: z.number().nonnegative() })).nullable().optional(),
  freeThreshold: z.number().nonnegative().nullable().optional(),
  estimatedDays: z.string().nullable().optional(),
})

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid rate' }, { status: 400 })
  const { id } = await createShippingRate(parsed.data)
  return NextResponse.json({ id }, { status: 201 })
}
