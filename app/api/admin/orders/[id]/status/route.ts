import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { applyOrderStatusChange } from '@/modules/shop/lib/order-status'

const Body = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'ON_HOLD']),
  sendEmail: z.boolean().optional(),
})

// Courier, tracking number and tracking link are per-parcel and are typed into
// the dispatch screen, which records them on the shipment. A status change has
// no parcel of its own to hang them on, so it does not take them: the dispatch
// email still quotes whatever the order's parcels carry.

// The pre-order hold, the implicit shipment on SHIPPED, the allocation released
// on CANCELLED and the customer email all live in lib/order-status.ts, because
// the bulk bar on the orders list makes exactly the same change and the two must
// not drift apart.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const outcome = await applyOrderStatusChange({
    orderId: id,
    status: parsed.data.status,
    sendEmail: parsed.data.sendEmail,
  })
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })

  return NextResponse.json({ success: true })
}
