import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { updateShippingRate, deleteShippingRate } from '@/modules/shop/lib/db'

const Body = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['FLAT', 'WEIGHT_BASED', 'FREE']).optional(),
  flatRate: z.number().nonnegative().nullable().optional(),
  weightRates: z.array(z.object({ upToKg: z.number().positive(), rate: z.number().nonnegative() })).nullable().optional(),
  freeThreshold: z.number().nonnegative().nullable().optional(),
  estimatedDays: z.string().nullable().optional(),
  position: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid rate' }, { status: 400 })
  await updateShippingRate(id, parsed.data)
  return NextResponse.json({ success: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  const { id } = await params
  await deleteShippingRate(id)
  return NextResponse.json({ success: true })
}
