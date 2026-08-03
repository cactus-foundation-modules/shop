import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { applyOrderStatusChange } from '@/modules/shop/lib/order-status'

const Body = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.literal('status'),
  status: z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'ON_HOLD']),
  sendEmail: z.boolean().optional(),
})

// Status changes for a selection on the orders list.
//
// Every order goes through the same applyOrderStatusChange the single order
// screen uses, one at a time and in order, so a bulk change cannot take a
// shortcut past a rule the single change respects - the pre-order hold in
// particular. Orders are handled one after another rather than in parallel
// because each takes the order's advisory lock while recording an implicit
// shipment, and there is nothing to gain from queueing behind ourselves.
//
// A refusal is per-order and never aborts the run: marking twelve orders as
// dispatched when one of them is holding a pre-order should send the eleven
// and tell the owner about the one, not silently do nothing to any of them.
export async function POST(request: NextRequest) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })

  const { ids, status, sendEmail } = parsed.data
  let updated = 0
  let unchanged = 0
  const failures: Array<{ orderNumber: string; error: string }> = []

  for (const id of ids) {
    const outcome = await applyOrderStatusChange({ orderId: id, status, sendEmail })
    if (outcome.ok) {
      if (outcome.changed) updated += 1
      else unchanged += 1
      continue
    }
    // Named by order number, not id - the owner is looking at a list of order
    // numbers, and a cuid tells them nothing about which one to go and look at.
    const order = await getOrderById(id)
    failures.push({ orderNumber: order?.orderNumber ?? id, error: outcome.error })
  }

  return NextResponse.json({ updated, unchanged, failures })
}
