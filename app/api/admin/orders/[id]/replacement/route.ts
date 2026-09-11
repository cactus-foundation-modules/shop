import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { createReplacementOrder } from '@/modules/shop/lib/replacements'
import { listReplacementOrdersForParent } from '@/modules/shop/lib/db/orders'

// PROTECTED - the parts sent out to put one order right.
//
// GET lists them, POST raises one. Both hang off the ORIGINAL order's id, which
// is how everybody thinks about this: a customer rings up about DW000182, not
// about a replacement that does not exist yet.

const Body = z.object({
  lines: z.array(z.object({
    productId: z.string().nullable().optional(),
    // Long enough for "Gas lift, black, 100mm stroke" and short enough that
    // nobody pastes an email into it.
    name: z.string().max(200).nullable().optional(),
    quantity: z.number().int().min(1).max(999),
    // Almost always absent, which is free. A figure here is the shop deciding
    // to charge for a part - out of warranty, or the customer's own doing.
    unitPrice: z.number().min(0).max(1000000).nullable().optional(),
    replacesOrderItemId: z.string().nullable().optional(),
  })).min(1).max(50),
  // The damage report being answered, where the owner came from the queue.
  requestId: z.string().nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
})

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  return NextResponse.json({ replacements: await listReplacementOrdersForParent(id) })
}

// Gated WITHOUT allowAccess, unlike the GET: read-only shop access is enough to
// look at what has been sent and not enough to send anything.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid replacement' }, { status: 400 })
  }

  const outcome = await createReplacementOrder({
    parentOrderId: id,
    lines: parsed.data.lines.map((line) => ({
      productId: line.productId ?? null,
      name: line.name ?? null,
      quantity: line.quantity,
      unitPrice: line.unitPrice ?? null,
      replacesOrderItemId: line.replacesOrderItemId ?? null,
    })),
    requestId: parsed.data.requestId ?? null,
    note: parsed.data.note ?? null,
    userId: gate.user.id,
  })

  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  return NextResponse.json({ order: outcome.order, orderNumber: outcome.orderNumber }, { status: 201 })
}
