import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { updateProduct } from '@/modules/shop/lib/db/products'
import { setUpsellProducts, setAutoExcludedProducts } from '@/modules/shop/lib/db/recommendations'

const Body = z.object({
  mode: z.enum(['MANUAL', 'AUTOMATIC']),
  limit: z.number().int().positive(),
  upsellIds: z.array(z.string()),
  excludedIds: z.array(z.string()).optional(),
})

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error

  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid recommendation data' }, { status: 400 })

  await updateProduct(id, { upsellMode: parsed.data.mode, upsellLimit: parsed.data.limit })
  await setUpsellProducts(id, parsed.data.upsellIds)
  if (parsed.data.excludedIds) await setAutoExcludedProducts(id, parsed.data.excludedIds)

  return NextResponse.json({ success: true })
}
