import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getOrderById, markOrderPaid, markOrderPaymentFailed, markOrderAwaitingConfirmation, setOrderPaymentReference } from '@/modules/shop/lib/db/orders'
import { getPaymentProvider } from '@/modules/shop/lib/payments/registry'
import { fulfillPaidOrder } from '@/modules/shop/lib/order-fulfillment'
import { announceOrderAwaitingPayment } from '@/modules/shop/lib/order-placed-email'
import { rememberOrderAddress } from '@/modules/shop/lib/order-address-book'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'
import { getCheckoutDraft, materialiseDraftOrder } from '@/modules/shop/lib/checkout-draft'

const Body = z.object({ orderId: z.string(), payload: z.unknown() })

// PROTECTED - confirms payment server-side via the provider, never trusting
// the client's own claim that payment succeeded (spec 7).
export async function POST(request: NextRequest) {
  // Unauthenticated by necessity - a guest finishing a checkout has no session -
  // so the only thing standing between an order id and a stranger is this. The
  // provider decides whether money moved, so nobody can fake a payment here; what
  // they COULD do unthrottled is walk order ids and drive other people's pending
  // orders to PAYMENT_FAILED, one call each.
  const ip = getClientIpFromRequest(request)
  if (!checkInMemoryRateLimit(`checkout-confirm:${ip}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts, please try again in a little while.' }, { status: 429 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const order = await getOrderById(parsed.data.orderId)
  // No order under that id may simply mean it has not earned one yet: a method
  // that settles on the provider's own site drafts the order and creates it when
  // the money is committed. See confirmDraft below, and lib/checkout-draft.ts.
  if (!order) return confirmDraft(parsed.data.orderId, parsed.data.payload)
  if (order.paymentStatus === 'PAID') return NextResponse.json({ orderNumber: order.orderNumber, status: 'PAID' })

  const provider = getPaymentProvider(order.paymentMethod)
  if (!provider) return NextResponse.json({ error: 'Payment method is no longer available.' }, { status: 400 })

  // Manual providers (bank transfer, cash) have no automated confirmation - park
  // the order for an admin to clear once the money actually arrives.
  if (provider.confirmMode === 'manual') {
    await markOrderAwaitingConfirmation(order.id)
    // The shopper has finished checking out even though the money has not
    // landed yet, so their address is saved now rather than whenever the shop
    // gets round to confirming the transfer. fulfillPaidOrder saves it too when
    // that confirmation eventually comes; rememberOrderAddress dedupes, so the
    // second attempt is a no-op rather than a duplicate.
    await rememberOrderAddress(order)
    // And the only email in the shop that is a request for payment: the order
    // exists, here is where to send the money, and nothing starts moving until
    // it arrives. Deliberately NOT sent on the `result.pending` branch below -
    // that is an automated method whose money is already committed and merely
    // settling, and telling that shopper to go and pay would be wrong twice.
    await announceOrderAwaitingPayment(order)
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
    await rememberOrderAddress(order)
    return NextResponse.json({ orderNumber: order.orderNumber, status: 'AWAITING_CONFIRMATION' })
  }

  const justPaid = await markOrderPaid(order.id, result.providerReference ?? '')
  if (justPaid) await fulfillPaidOrder(order.id)

  return NextResponse.json({ orderNumber: order.orderNumber, status: 'PAID' })
}

// Confirming a checkout that has no order yet.
//
// The order of events here is the whole point, and it is the reverse of the
// route above: ask the provider FIRST, and create the order only if the answer
// is yes. A refusal leaves nothing behind - no order, no number in anybody's
// list - which is exactly what a shopper who never paid should leave.
async function confirmDraft(orderId: string, payload: unknown): Promise<NextResponse> {
  const draft = await getCheckoutDraft(orderId)
  if (!draft) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const provider = getPaymentProvider(draft.paymentMethod)
  if (!provider) return NextResponse.json({ error: 'Payment method is no longer available.' }, { status: 400 })
  // A manual method has nothing to ask a provider about, so it never drafts:
  // its order is written at checkout and somebody clears it by hand later. A
  // draft on one is a state that should not exist, and inventing an order for it
  // here would be guessing about money.
  if (provider.confirmMode === 'manual') {
    return NextResponse.json({ error: 'Payment could not be confirmed' }, { status: 402 })
  }

  const result = await provider.confirmPayment(
    {
      orderId: draft.id,
      orderNumber: draft.orderNumber,
      amount: Number(draft.total),
      currency: draft.currency,
      customerEmail: draft.customerEmail,
      customerName: draft.customerName,
    },
    payload
  )
  // Nothing to mark FAILED, and nothing to create. The draft is left where it is
  // so a shopper who tries again lands on the same order number rather than
  // burning a fresh one on every attempt.
  if (!result.success) {
    return NextResponse.json({ error: result.error ?? 'Payment could not be confirmed' }, { status: 402 })
  }

  const created = await materialiseDraftOrder(draft.id)
  if (!created) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  if (result.providerReference) await setOrderPaymentReference(created.id, result.providerReference)

  // Authorised but not yet settled (e.g. open-banking). The money is committed,
  // which is why there is an order at all - it just is not paid yet, so the
  // provider's webhook flips it to PAID.
  if (result.pending) {
    await markOrderAwaitingConfirmation(created.id)
    const fresh = await getOrderById(created.id)
    if (fresh) await rememberOrderAddress(fresh)
    return NextResponse.json({ orderNumber: created.orderNumber, status: 'AWAITING_CONFIRMATION' })
  }

  const justPaid = await markOrderPaid(created.id, result.providerReference ?? '')
  if (justPaid) await fulfillPaidOrder(created.id)

  return NextResponse.json({ orderNumber: created.orderNumber, status: 'PAID' })
}
