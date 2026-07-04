import { NextRequest, NextResponse } from 'next/server'
import { paypalProvider } from '@/modules/shop/lib/payments/paypal'
import { markOrderPaid, markOrderPaymentFailed, setOrderPaymentReference, updateOrderStatus } from '@/modules/shop/lib/db/orders'
import { fulfillPaidOrder } from '@/modules/shop/lib/order-fulfillment'

// PROTECTED - unauthenticated, signature-verified webhook receiver (spec 7.2).
export async function POST(request: NextRequest) {
  const result = await paypalProvider.handleWebhook!(request)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  if (!result.orderId) return NextResponse.json({ received: true })

  if (result.status === 'PAID') {
    const reference = result.providerReference ?? result.orderId
    await setOrderPaymentReference(result.orderId, reference)
    const justPaid = await markOrderPaid(result.orderId, reference)
    if (justPaid) await fulfillPaidOrder(result.orderId)
  } else if (result.status === 'FAILED') {
    await markOrderPaymentFailed(result.orderId)
  } else if (result.status === 'REFUNDED' || result.status === 'PARTIALLY_REFUNDED') {
    await updateOrderStatus(result.orderId, result.status === 'REFUNDED' ? 'REFUNDED' : 'PARTIALLY_REFUNDED')
  }

  return NextResponse.json({ received: true })
}
