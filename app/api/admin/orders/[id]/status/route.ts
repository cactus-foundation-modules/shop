import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { applyOrderStatusChange } from '@/modules/shop/lib/order-status'

const Body = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'ON_HOLD']),
  sendEmail: z.boolean().optional(),
  // Only read on SHIPPED, where they go onto the parcel this change records and
  // into the dispatch email. Marking a whole order as dispatched had nowhere to
  // put them, so the customer was told it was on its way and given no way to
  // follow it.
  trackingNumber: z.string().nullable().optional(),
  carrier: z.string().nullable().optional(),
})

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
    trackingNumber: parsed.data.trackingNumber,
    carrier: parsed.data.carrier,
  })
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })

  return NextResponse.json({ success: true })
}
