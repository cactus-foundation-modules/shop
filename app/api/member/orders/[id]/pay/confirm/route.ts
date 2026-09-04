import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/utils'
import {
  adoptOrderPaymentMethod, markOrderAwaitingConfirmation, markOrderPaid, setOrderPaymentReference,
} from '@/modules/shop/lib/db/orders'
import { requireOrderAccess } from '@/modules/shop/lib/order-route-access'
import { getPaymentProvider } from '@/modules/shop/lib/payments/registry'
import { assertPayableOnline } from '@/modules/shop/lib/order-pay-online'
import { fulfillPaidOrder } from '@/modules/shop/lib/order-fulfillment'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'

const Body = z.object({ method: z.string().min(1), payload: z.unknown() })

// PROTECTED - finishes a payment started by the route above, for a method whose
// fields are filled in on this page rather than on the provider's own site.
//
// The provider decides whether money moved; the payload is a one-time card token
// and is never read here as an outcome. A method that hands the shopper over
// instead never reaches this route at all - its own return route and webhook
// settle it, and both are content to find the order already there.
//
// Nothing is marked FAILED on a refusal, deliberately. Unlike a checkout, the
// order on the other end of this is a real placed order that somebody may well
// still pay by bank transfer tomorrow: a declined card is a card that did not
// work, not an order that fell over.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!checkInMemoryRateLimit(`shop_order_pay_confirm:${getClientIpFromRequest(request)}`, 20, 15 * 60 * 1000)) {
    return errorResponse('Too many attempts, please try again in a little while.', 429)
  }

  const { id } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorResponse('Invalid request')

  const access = await requireOrderAccess(id)
  if (!access.ok) return access.error
  const { order } = access
  if (order.paymentStatus === 'PAID') return NextResponse.json({ status: 'PAID' })

  const payable = await assertPayableOnline(order, parsed.data.method)
  if (!payable.ok) return errorResponse(payable.error, payable.status)

  const provider = getPaymentProvider(parsed.data.method)
  if (!provider) return errorResponse('That way of paying is not available for this order.')

  const result = await provider.confirmPayment(
    {
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: Number(order.total),
      currency: order.currency,
      customerEmail: order.customerEmail,
      customerName: order.customerName,
    },
    parsed.data.payload,
  )
  if (!result.success) return errorResponse(result.error ?? 'Payment could not be confirmed', 402)

  // Belt and braces: the intent route already did this, and this is the point
  // past which getting it wrong costs somebody a refund they never receive.
  await adoptOrderPaymentMethod(order.id, parsed.data.method)
  if (result.providerReference) await setOrderPaymentReference(order.id, result.providerReference)

  // Authorised but not settled yet (open banking, a card still capturing). The
  // money is committed; the provider's webhook flips it to PAID.
  if (result.pending) {
    await markOrderAwaitingConfirmation(order.id)
    return NextResponse.json({ status: 'AWAITING_CONFIRMATION' })
  }

  // Gated on the atomic flip, as everywhere else: fulfilment's side-effects are
  // exactly-once. The email it sends is PAYMENT_RECEIVED rather than a second
  // order confirmation, worked out from the order's own original method - see
  // fulfillPaidOrder.
  const justPaid = await markOrderPaid(order.id, result.providerReference ?? '')
  if (justPaid) await fulfillPaidOrder(order.id)

  return NextResponse.json({ status: 'PAID' })
}
