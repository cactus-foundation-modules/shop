import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { reorderTags } from '@/modules/shop/lib/db'
import { CATALOGUE_REORDER_MAX_IDS, formatLimit } from '@/modules/shop/lib/admin-input-limits'

// Persists the whole list's order - the admin sends every tag id in its new
// order and position is written as the array index. Tags are a flat list, so
// unlike the category equivalent there is no re-parenting to guard against.
// The order decides two things: how the admin list reads, and which badge wins
// when a product carries two badge tags. Same ceiling as the category and
// collection reorders, since this is one transaction too.
const Body = z.object({
  orderedIds: z.array(z.string()).min(1)
    .max(CATALOGUE_REORDER_MAX_IDS, `That is more than ${formatLimit(CATALOGUE_REORDER_MAX_IDS)} tags to reorder at once.`),
})

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid order' }, { status: 400 })
  await reorderTags(parsed.data.orderedIds)
  return NextResponse.json({ success: true })
}
