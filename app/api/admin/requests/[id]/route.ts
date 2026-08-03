import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { approveOrderRequest, declineOrderRequest } from '@/modules/shop/lib/order-request-actions'

const Body = z.object({
  decision: z.enum(['APPROVED', 'DECLINED']),
  adminNote: z.string().max(2000).nullable().optional(),
  // Whether approving also sends the money back. Never defaulted true on the
  // server: a refund is money leaving, and it happens because somebody ticked
  // a box that said so, not because a field was missing from a request body.
  refund: z.boolean().optional(),
})

// PROTECTED - approve or decline a customer's cancel/return request.
//
// A 200 with `refundError` set means the decision stands but the money did not
// move: the request is recorded as approved and the refund can be retried from
// the order screen, where the refund UI already lives. Reporting that plainly
// beats pretending either that it all worked or that none of it did.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid decision' }, { status: 400 })
  }

  const outcome = parsed.data.decision === 'APPROVED'
    ? await approveOrderRequest({
        requestId: id,
        adminNote: parsed.data.adminNote ?? null,
        userId: gate.user.id,
        refund: parsed.data.refund === true,
      })
    : await declineOrderRequest({
        requestId: id,
        adminNote: parsed.data.adminNote ?? null,
        userId: gate.user.id,
      })

  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  return NextResponse.json({
    request: outcome.request,
    refundError: outcome.refundError ?? null,
    refundedAmount: outcome.refundedAmount ?? null,
  })
}
