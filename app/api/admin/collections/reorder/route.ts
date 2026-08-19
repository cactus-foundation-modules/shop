import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { reorderCollections } from '@/modules/shop/lib/db'

// Persists the order collections list in. The admin screen sends every
// collection id in its new order; position is written as the array index.
// Mirrors the categories reorder route, minus the re-parenting - collections
// are a flat list, so there is no tree to keep honest.
const Body = z.object({ orderedIds: z.array(z.string()).min(1) })

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid order' }, { status: 400 })
  await reorderCollections(parsed.data.orderedIds)
  return NextResponse.json({ success: true })
}
