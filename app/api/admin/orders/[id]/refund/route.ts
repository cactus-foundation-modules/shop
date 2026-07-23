import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { processRefund } from '@/modules/shop/lib/db/refunds'
import { getPaymentProvider } from '@/modules/shop/lib/payments/registry'

const Body = z.object({
  reason: z.string().nullable().optional(),
  items: z.array(z.object({ orderItemId: z.string(), quantity: z.number().int().min(1), amount: z.number().nonnegative() })).min(1),
})

// PROTECTED - per-item refund. processRefund serialises concurrent refunds on
// one order behind an advisory lock plus a PENDING reservation row, so two
// overlapping requests can't both slip past the caps (TOCTOU over-refund); the
// second gets a 409. The provider call happens with no database transaction
// open, so a slow payment provider never pins a pooled connection. The refund
// row id is handed to the provider as a deterministic idempotency key so a
// retried provider call can never refund twice.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (!order.paymentReference && (order.paymentMethod === 'STRIPE' || order.paymentMethod === 'PAYPAL')) {
    return NextResponse.json({ error: 'Order has no payment reference to refund against' }, { status: 400 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid refund' }, { status: 400 })

  const provider = getPaymentProvider(order.paymentMethod)
  if (!provider) return NextResponse.json({ error: 'No payment provider is registered for this order.' }, { status: 400 })

  const totalAmount = parsed.data.items.reduce((sum, i) => sum + i.amount, 0)

  const outcome = await processRefund({
    orderId: id,
    reason: parsed.data.reason ?? null,
    createdBy: gate.user.id,
    items: parsed.data.items,
    performRefund: async (idempotencyKey) => {
      const result = await provider.refundOrder({
        providerReference: order.paymentReference ?? '',
        amount: totalAmount,
        currency: order.currency,
        items: parsed.data.items.map((i) => ({ name: i.orderItemId, quantity: i.quantity, amount: i.amount })),
        idempotencyKey,
      })
      return { success: result.success, providerRefundId: result.providerRefundId ?? null, error: result.error }
    },
  })

  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  return NextResponse.json({ refundId: outcome.refundId, success: outcome.success, error: outcome.error }, { status: outcome.success ? 201 : 502 })
}
