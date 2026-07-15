import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { reorderCategories, categoryReparentWouldCycle } from '@/modules/shop/lib/db'

// Persists the order of one parent's children. The admin tree sends the sibling
// group's ids in their new order; position is written as the array index.
//
// `parentId` is optional: omit it (up/down arrows) to reorder in place; send it
// (drag-and-drop) to also re-file every id under that parent, which is how a
// category is dragged into a new parent or back out to the top level. `null`
// means the top level.
const Body = z.object({
  orderedIds: z.array(z.string()).min(1),
  parentId: z.string().nullable().optional(),
})

export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid order' }, { status: 400 })
  const { orderedIds, parentId } = parsed.data
  // A re-parent must never drop a category inside itself or one of its own
  // sub-categories - that would strand the sub-tree and hang recursive walks.
  if (parentId != null) {
    for (const id of orderedIds) {
      if (await categoryReparentWouldCycle(id, parentId)) {
        return NextResponse.json({ error: 'A category cannot be moved inside itself or one of its own sub-categories.' }, { status: 400 })
      }
    }
  }
  await reorderCategories(orderedIds, parentId)
  return NextResponse.json({ success: true })
}
