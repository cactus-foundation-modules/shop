import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/utils'
import { loadOrderDetail } from '@/modules/shop/lib/member-orders'
import { requireOrderAccess } from '@/modules/shop/lib/order-route-access'
import { submitOrderRequest } from '@/modules/shop/lib/order-request-actions'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'

const Body = z.object({
  type: z.enum(['CANCEL', 'RETURN']),
  reason: z.string().min(1),
  customerNote: z.string().max(2000).nullable().optional(),
  items: z.array(z.object({ orderItemId: z.string(), quantity: z.number().int().min(1) })).optional(),
})

// PROTECTED - a customer asking for one of their own orders to be called off or
// sent back. A signed-in member, or a guest who has proved the delivery postcode
// (lib/order-route-access.ts).
//
// Eligibility is re-checked here against lib/order-requests.ts rather than
// trusted from the page that offered the button: the rules are the same
// functions the page used, so the two cannot drift, but a hand-rolled POST gets
// exactly the same answer a real click would have.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Secondary guard only - the access check below is the real one.
  if (!checkInMemoryRateLimit(`shop_request:${getClientIpFromRequest(request)}`, 10, 60_000)) {
    return errorResponse('That is a lot of requests at once. Give it a minute.', 429)
  }

  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid request')

  const access = await requireOrderAccess(id)
  if (!access.ok) return access.error

  const detail = await loadOrderDetail(id)
  if (!detail) return errorResponse('Order not found', 404)

  const eligibility = parsed.data.type === 'CANCEL' ? detail.cancel : detail.return
  if (!eligibility.allowed) return errorResponse(eligibility.reason, 409)

  const outcome = await submitOrderRequest({
    orderId: id,
    // The account the ORDER belongs to, not whoever is standing at the keyboard.
    // A guest has no account, so their request records none; and a guest order
    // that has since been claimed by an account belongs to that account whether
    // this particular visit was signed in or not.
    memberId: access.order.memberId,
    type: parsed.data.type,
    reason: parsed.data.reason,
    customerNote: parsed.data.customerNote ?? null,
    items: parsed.data.type === 'RETURN' ? parsed.data.items ?? [] : [],
  })

  if (!outcome.ok) return errorResponse(outcome.error, outcome.status)
  return NextResponse.json({ request: outcome.request }, { status: 201 })
}
