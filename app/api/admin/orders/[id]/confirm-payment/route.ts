import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById, confirmManualPayment, restoreOriginalPaymentMethod } from '@/modules/shop/lib/db/orders'
import { fulfillPaidOrder } from '@/modules/shop/lib/order-fulfillment'
import { settlementMethod } from '@/modules/shop/lib/order-pay-online'

// Manually confirm bank transfer / cash payment once it clears (spec 8.3).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  // The tick box on the mark-as-paid dialog. A body is optional so an older
  // screen (or a curl) still behaves as it always did: tell the customer.
  const body = (await request.json().catch(() => ({}))) as { sendEmail?: boolean }
  const sendEmail = body.sendEmail !== false

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  // The method the order was PLACED with, not necessarily the one on it now: a
  // customer who started a card payment from their own order page and thought
  // better of it has moved payment_method on, and may perfectly well have gone
  // and done the transfer instead. Refusing here would leave that order with no
  // way to be marked paid at all.
  const placed = settlementMethod(order)
  if (placed !== 'BANK_TRANSFER' && placed !== 'CASH') {
    return NextResponse.json({ error: 'Only bank transfer and cash payments are confirmed manually' }, { status: 400 })
  }
  if (order.paymentStatus === 'PAID') return NextResponse.json({ success: true })

  // Gate fulfilment on the atomic flip so two overlapping confirm clicks can't
  // both run the exactly-once side-effects (stock/coupon/downloads/emails).
  //
  // The customer's email here is PAYMENT_RECEIVED, not the order confirmation an
  // automated payment sends. They saw their order number and the bank details on
  // the confirmation page days ago; what is news today is that the money landed.
  // The money came the way the order was placed, so the order says so again
  // before it is marked paid - otherwise a refund would go looking for the card
  // payment the customer started and abandoned. A no-op on the ordinary order
  // that never moved.
  await restoreOriginalPaymentMethod(id)

  const justPaid = await confirmManualPayment(id)
  if (justPaid) await fulfillPaidOrder(id, { customerNotice: sendEmail ? 'PAYMENT_RECEIVED' : 'NONE' })
  return NextResponse.json({ success: true })
}
