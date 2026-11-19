import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { ORDER_LINE_BATCH_MAX } from '@/modules/shop/lib/order-line-limits'
import { submitOrderRequest } from '@/modules/shop/lib/order-request-actions'

const Body = z.object({
  type: z.enum(['CANCEL', 'RETURN', 'DAMAGE']),
  reason: z.string().min(1),
  // What the customer told us, in their words or near enough. Stored where the
  // customer's own note goes, because that is what it is.
  customerNote: z.string().max(2000).nullable().optional(),
  items: z
    .array(z.object({
      orderItemId: z.string(),
      quantity: z.number().int().min(1),
      missing: z.enum(['WHOLE', 'PARTS']).nullable().optional(),
    }))
    .max(ORDER_LINE_BATCH_MAX, 'That is more items than one order holds.')
    .optional(),
  // Off unless ticked: a customer emailed about a request they did not type
  // should be because somebody decided they should be.
  notifyCustomer: z.boolean().optional(),
  // Issue reports only: ask for photographs as the report is raised.
  requestPhotos: z.boolean().optional(),
  photoRequestNote: z.string().max(1000).nullable().optional(),
})

// PROTECTED - staff raising a cancellation, return or issue report on the
// customer's behalf: the phone call, the email, the conversation at the door.
//
// The same recording path as the customer's own (lib/order-request-actions.ts),
// so the lines are checked against the order exactly as a customer's would be -
// nothing called off that has gone, nothing reported that has not arrived. What
// is NOT applied is the customer-facing eligibility - the returns window, the
// shop's switches for what customers may ask for online - because staff raising
// one is the shop deciding to take the request, which is theirs to decide.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'That order no longer exists.' }, { status: 404 })

  const outcome = await submitOrderRequest(
    {
      orderId: id,
      memberId: order.memberId,
      type: parsed.data.type,
      reason: parsed.data.reason,
      customerNote: parsed.data.customerNote ?? null,
      items: parsed.data.items ?? [],
      raisedBy: gate.user.id,
    },
    {
      notifyCustomer: parsed.data.notifyCustomer === true,
      alertShop: false,
      photoRequest: parsed.data.type === 'DAMAGE' && parsed.data.requestPhotos === true
        ? { note: parsed.data.photoRequestNote ?? null, userId: gate.user.id }
        : null,
    },
  )

  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  return NextResponse.json({ request: outcome.request }, { status: 201 })
}
