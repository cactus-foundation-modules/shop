import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { addOrderNote } from '@/modules/shop/lib/db/orders'
import { ORDER_NOTE_MAX_LENGTH, formatLimit } from '@/modules/shop/lib/admin-input-limits'

// A note is read back on every open of the order, so it has a ceiling - see
// lib/admin-input-limits.ts. Too long is said in words, since the order screen
// shows this message to whoever typed the note.
const Body = z.object({
  content: z.string().min(1, 'Write something in the note first.')
    .max(ORDER_NOTE_MAX_LENGTH, `That note is too long - ${formatLimit(ORDER_NOTE_MAX_LENGTH)} characters at most.`),
  isInternal: z.boolean().optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid note' }, { status: 400 })

  await addOrderNote(id, parsed.data.content, parsed.data.isInternal ?? true, gate.user.id)
  return NextResponse.json({ success: true }, { status: 201 })
}
