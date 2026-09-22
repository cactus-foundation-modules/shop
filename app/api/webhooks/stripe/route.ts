import { NextRequest, NextResponse } from 'next/server'
import { stripeProvider } from '@/modules/shop/lib/payments/stripe'
import { getOrderById, markOrderPaid, markOrderPaymentFailed, recordProviderRefund, setOrderPaymentReference } from '@/modules/shop/lib/db/orders'
import { recordOrphanedPayment } from '@/modules/shop/lib/stranded-payments'
import { fulfillPaidOrder } from '@/modules/shop/lib/order-fulfillment'
import { holdIfPaidAmountDisagrees } from '@/modules/shop/lib/payments/webhook-settlement'
import { recordRefundMadeAtProvider } from '@/modules/shop/lib/provider-refund-ingest'

// PROTECTED - unauthenticated, signature-verified webhook receiver (spec 7.1).
// Idempotent: markOrderPaid()'s WHERE clause makes a replayed event a no-op.
//
// A payment for the wrong amount or currency is still recorded - the event is
// signed, so the money is real - but the order is held with a note once
// fulfilment has run, so nobody sends goods on it without looking. In a
// `finally` so the hold lands even if something in fulfilment throws.
export async function POST(request: NextRequest) {
  const result = await stripeProvider.handleWebhook!(request)
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
    } else if (result.paidAmount && result.orderNumber && !(await getOrderById(result.orderId))) {
      // Nothing marked paid because there is no order left to mark: the money
      // arrived after the unpaid order was swept away. Raised on the orders
      // screen rather than dropped - see recordOrphanedPayment. Only for a
      // payment this site took (orderNumber is only set for those), or a second
      // site sharing the Stripe account would see every one of its sales here.
      await recordOrphanedPayment({
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        paymentMethod: 'STRIPE',
        amountMinorUnits: result.paidAmount.minorUnits,
        currency: result.paidAmount.currency,
      })
    }
  } else if (result.status === 'FAILED') {
    await markOrderPaymentFailed(result.orderId)
  } else if (result.status === 'REFUNDED' || result.status === 'PARTIALLY_REFUNDED') {
    // A refund made in Stripe's own dashboard is recorded as one, where the
    // shop can tell which items it covered - see recordRefundMadeAtProvider.
    // Asked to send it again if another refund on the order is mid-flight.
    if (result.refundedTotal !== undefined) {
      const recorded = await recordRefundMadeAtProvider(result.orderId, {
        refundedTotal: Number(result.refundedTotal),
        full: result.status === 'REFUNDED',
        providerLabel: 'Stripe',
      })
      if (recorded === 'busy') return NextResponse.json({ error: 'A refund on this order is being recorded. Send this again shortly.' }, { status: 503 })
    }
    // The payment follows the refund as well as the lifecycle - see
    // recordProviderRefund for why neither is ever moved backwards.
    await recordProviderRefund(result.orderId, result.status)
  }

  return NextResponse.json({ received: true })
}
