import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { addOrderNote } from '@/modules/shop/lib/db/orders'

const Body = z.object({ content: z.string().min(1), isInternal: z.boolean().optional() })

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid note' }, { status: 400 })

  await addOrderNote(id, parsed.data.content, parsed.data.isInternal ?? true, gate.user.id)
  return NextResponse.json({ success: true }, { status: 201 })
}
