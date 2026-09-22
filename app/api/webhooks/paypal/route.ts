import { NextRequest, NextResponse } from 'next/server'
import { paypalProvider } from '@/modules/shop/lib/payments/paypal'
import { markOrderPaid, markOrderPaymentFailed, recordProviderRefund, setOrderPaymentReference } from '@/modules/shop/lib/db/orders'
import { fulfillPaidOrder } from '@/modules/shop/lib/order-fulfillment'
import { holdIfPaidAmountDisagrees } from '@/modules/shop/lib/payments/webhook-settlement'
import { recordRefundMadeAtProvider } from '@/modules/shop/lib/provider-refund-ingest'

// PROTECTED - unauthenticated, signature-verified webhook receiver (spec 7.2).
// A capture for the wrong amount or currency is recorded and then held with a
// note, exactly as in the Stripe receiver beside this one.
export async function POST(request: NextRequest) {
  const result = await paypalProvider.handleWebhook!(request)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  if (!result.orderId) return NextResponse.json({ received: true })

  if (result.status === 'PAID') {
    const reference = result.providerReference ?? result.orderId
    await setOrderPaymentReference(result.orderId, reference)
    const justPaid = await markOrderPaid(result.orderId, reference)
    if (justPaid) {
      try {
        await fulfillPaidOrder(result.orderId)
      } finally {
        await holdIfPaidAmountDisagrees(result.orderId, result.paidAmount)
      }
    }
  } else if (result.status === 'FAILED') {
    await markOrderPaymentFailed(result.orderId)
  } else if (result.status === 'REFUNDED' || result.status === 'PARTIALLY_REFUNDED') {
    // A refund made in PayPal's own dashboard is recorded as one, where the
    // shop can tell which items it covered - see recordRefundMadeAtProvider.
    // Asked to send it again if another refund on the order is mid-flight.
    if (result.refundedTotal !== undefined) {
      const recorded = await recordRefundMadeAtProvider(result.orderId, {
        refundedTotal: Number(result.refundedTotal),
        full: result.status === 'REFUNDED',
        providerLabel: 'PayPal',
      })
      if (recorded === 'busy') return NextResponse.json({ error: 'A refund on this order is being recorded. Send this again shortly.' }, { status: 503 })
    }
    // The payment follows the refund as well as the lifecycle - see
    // recordProviderRefund for why neither is ever moved backwards.
    await recordProviderRefund(result.orderId, result.status)
  }

  return NextResponse.json({ received: true })
}
