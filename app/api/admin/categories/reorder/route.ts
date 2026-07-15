import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { reorderCategories } from '@/modules/shop/lib/db'

// Persists the order of one parent's children. The admin tree sends the sibling
// group's ids in their new order; position is written as the array index.
const Body = z.object({ orderedIds: z.array(z.string()).min(1) })

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid order' }, { status: 400 })
  await reorderCategories(parsed.data.orderedIds)
  return NextResponse.json({ success: true })
}
