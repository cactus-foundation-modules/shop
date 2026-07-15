import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getOrderById, markOrderPaid, markOrderPaymentFailed, markOrderAwaitingConfirmation, setOrderPaymentReference } from '@/modules/shop/lib/db/orders'
import { getPaymentProvider } from '@/modules/shop/lib/payments/registry'
import { fulfillPaidOrder } from '@/modules/shop/lib/order-fulfillment'

const Body = z.object({ orderId: z.string(), payload: z.unknown() })

// PROTECTED - confirms payment server-side via the provider, never trusting
// the client's own claim that payment succeeded (spec 7).
export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const order = await getOrderById(parsed.data.orderId)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.paymentStatus === 'PAID') return NextResponse.json({ orderNumber: order.orderNumber, status: 'PAID' })

  const provider = getPaymentProvider(order.paymentMethod)
  if (!provider) return NextResponse.json({ error: 'Payment method is no longer available.' }, { status: 400 })

  // Manual providers (bank transfer, cash) have no automated confirmation - park
  // the order for an admin to clear once the money actually arrives.
  if (provider.confirmMode === 'manual') {
    await markOrderAwaitingConfirmation(order.id)
    return NextResponse.json({ orderNumber: order.orderNumber, status: 'AWAITING_CONFIRMATION' })
  }

  const result = await provider.confirmPayment(
    {
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: Number(order.total),
      currency: order.currency,
      customerEmail: order.customerEmail,
      customerName: order.customerName,
    },
    parsed.data.payload
  )
  if (!result.success) {
    await markOrderPaymentFailed(order.id)
    return NextResponse.json({ error: result.error ?? 'Payment could not be confirmed' }, { status: 402 })
  }

  if (result.providerReference) await setOrderPaymentReference(order.id, result.providerReference)

  // Authorised but not yet settled (e.g. open-banking): hold at
  // AWAITING_CONFIRMATION and let the provider's webhook flip it to PAID.
  if (result.pending) {
    await markOrderAwaitingConfirmation(order.id)
    return NextResponse.json({ orderNumber: order.orderNumber, status: 'AWAITING_CONFIRMATION' })
  }

  const justPaid = await markOrderPaid(order.id, result.providerReference ?? '')
  if (justPaid) await fulfillPaidOrder(order.id)

  return NextResponse.json({ orderNumber: order.orderNumber, status: 'PAID' })
}
