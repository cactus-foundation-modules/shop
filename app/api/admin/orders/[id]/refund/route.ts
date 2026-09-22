import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { listRefundsForOrder, processRefund } from '@/modules/shop/lib/db/refunds'
import { creditNoteForSettledRefund } from '@/modules/shop/lib/credit-notes'
import { refundRouteForOrder } from '@/modules/shop/lib/payments/order-refund-route'
import { withinRemaining } from '@/modules/shop/lib/request-refund-lines'
import { ORDER_LINE_BATCH_MAX, ORDER_LINE_BATCH_MAX_MESSAGE } from '@/modules/shop/lib/order-line-limits'

// Both bounded. The item list at what one order can hold, because prepareRefund
// reads and checks every row one at a time before it can refuse the lot; the
// reason at the length every other note in the admin takes, because it is
// stored on the refund and printed on the credit note behind it.
//
// Delivery rides alongside the lines as its own figure, tax included, and may
// be the whole refund. `alreadyRefunded` records a refund somebody has already
// made in the payment provider's own dashboard - the provider never says which
// items that was for, so this is how the owner tells the shop, and the stock,
// the credit note and the books then follow as they would for any refund. No
// money is sent for it: it has gone already.
const Body = z.object({
  reason: z.string().max(2000, 'Keep the reason under 2000 characters.').nullable().optional(),
  items: z
    .array(z.object({ orderItemId: z.string(), quantity: z.number().int().min(1), amount: z.number().nonnegative() }))
    .max(ORDER_LINE_BATCH_MAX, ORDER_LINE_BATCH_MAX_MESSAGE),
  shippingAmount: z.number().nonnegative().max(1_000_000).optional(),
  alreadyRefunded: z.boolean().optional(),
}).refine((body) => body.items.length > 0 || (body.shippingAmount ?? 0) > 0, { message: 'Choose something to refund.' })

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
  // A replacement carries its parent's method as a label only, never a
  // reference - its refund is recorded rather than sent (see refundRouteForOrder).
  if (order.kind !== 'REPLACEMENT' && !order.paymentReference && (order.paymentMethod === 'STRIPE' || order.paymentMethod === 'PAYPAL')) {
    return NextResponse.json({ error: 'Order has no payment reference to refund against' }, { status: 400 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid refund' }, { status: 400 })

  const provider = refundRouteForOrder(order)
  if (!provider) return NextResponse.json({ error: 'No payment provider is registered for this order.' }, { status: 400 })

  // Worked out line by line and rounded line by line, a full refund of a
  // discounted order can come to a penny or two more than the order took, and
  // the cap below then turns the whole refund down. Pennies over come off the
  // largest line, as they do when a customer's request is approved; anything
  // more than that is left for the cap to refuse in its own words.
  const shippingAmount = parsed.data.shippingAmount ?? 0
  const asked = parsed.data.items.reduce((sum, i) => sum + i.amount, 0) + shippingAmount
  const gone = (await listRefundsForOrder(id))
    .filter((refund) => refund.status === 'COMPLETED' || refund.status === 'PENDING')
    .reduce((sum, refund) => sum + Number(refund.amount), 0)
  const over = Math.round((asked - (Number(order.total) - gone)) * 100) / 100
  const items = over > 0 && over <= 0.05 ? withinRemaining(parsed.data.items, Number(order.total) - gone - shippingAmount) : parsed.data.items
  const totalAmount = items.reduce((sum, i) => sum + i.amount, 0) + shippingAmount

  const outcome = await processRefund({
    orderId: id,
    reason: parsed.data.reason ?? null,
    createdBy: gate.user.id,
    items,
    shippingAmount,
    performRefund: async (idempotencyKey) => {
      if (parsed.data.alreadyRefunded) return { success: true, providerRefundId: null }
      const result = await provider.refundOrder({
        providerReference: order.paymentReference ?? '',
        amount: totalAmount,
        currency: order.currency,
        items: items.map((i) => ({ name: i.orderItemId, quantity: i.quantity, amount: i.amount })),
        idempotencyKey,
      })
      return { success: result.success, providerRefundId: result.providerRefundId ?? null, error: result.error }
    },
  })

  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })

  // Money that has gone back needs a document behind it, and the books need
  // telling: an invoice left standing in full against a part-refunded order is
  // VAT the shop hands HMRC and never kept. Awaited rather than left dangling -
  // a serverless function that returns is a function that may stop executing -
  // and it never throws, so it cannot turn a good refund into a 500.
  if (outcome.success) await creditNoteForSettledRefund(outcome.refundId, { userId: gate.user.id })

  return NextResponse.json({ refundId: outcome.refundId, success: outcome.success, error: outcome.error }, { status: outcome.success ? 201 : 502 })
}
