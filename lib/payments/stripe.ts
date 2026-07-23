// PROTECTED - Stripe payment provider integration (spec 7.1). Server always
// re-validates the PaymentIntent's own status/amount/currency before trusting
// a client-reported "confirmed" - never trust the client alone.
import type {
  ShpOrderDraft, ShpPaymentIntent, ShpPaymentProvider, ShpPaymentResult, ShpRefundRequest, ShpRefundResult, ShpRefundStatusLookup, ShpWebhookResult,
} from '@/modules/shop/lib/payments/provider'
import { getOrderByPaymentReference } from '@/modules/shop/lib/db/orders'

let stripeClient: import('stripe').default | null = null

async function getStripe(): Promise<import('stripe').default> {
  if (stripeClient) return stripeClient
  const { default: Stripe } = await import('stripe')
  // No apiVersion pinned - uses the account's dashboard-configured default
  // rather than guessing a literal date string the installed SDK major might reject.
  stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')
  return stripeClient
}

function toMinorUnits(amount: number): number {
  return Math.round(amount * 100)
}

async function createIntent(order: ShpOrderDraft): Promise<ShpPaymentIntent> {
  const stripe = await getStripe()
  const intent = await stripe.paymentIntents.create({
    amount: toMinorUnits(order.amount),
    currency: order.currency.toLowerCase(),
    receipt_email: order.customerEmail,
    metadata: { shpOrderId: order.orderId, shpOrderNumber: order.orderNumber },
  })
  return { clientSecret: intent.client_secret ?? undefined, providerOrderId: intent.id }
}

// Re-fetches the PaymentIntent from Stripe and validates its own reported
// status, amount and currency - the client payload is only used to know
// which intent to check.
async function confirmPayment(order: ShpOrderDraft, payload: unknown): Promise<ShpPaymentResult> {
  const body = payload as { paymentIntentId?: string } | null
  const paymentIntentId = body?.paymentIntentId
  if (!paymentIntentId) return { success: false, error: 'Missing paymentIntentId' }

  const stripe = await getStripe()
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId)
  if (intent.metadata?.shpOrderId !== order.orderId) return { success: false, error: 'Payment intent does not match this order' }
  if (intent.status !== 'succeeded') return { success: false, error: `Payment not completed (status: ${intent.status})` }
  if (intent.amount !== toMinorUnits(order.amount)) return { success: false, error: 'Payment amount does not match this order' }
  if (intent.currency !== order.currency.toLowerCase()) return { success: false, error: 'Payment currency does not match this order' }

  return { success: true, providerReference: intent.id }
}

async function refundOrder(refund: ShpRefundRequest): Promise<ShpRefundResult> {
  const stripe = await getStripe()
  try {
    const result = await stripe.refunds.create(
      {
        payment_intent: refund.providerReference,
        amount: toMinorUnits(refund.amount),
        // Stamped so a refund whose outcome we never learned (the process died
        // between issuing it and recording it) can be found again later and
        // matched back to its row - see getRefundStatus.
        ...(refund.idempotencyKey ? { metadata: { shpRefundId: refund.idempotencyKey } } : {}),
      },
      // Stripe dedupes on the idempotency key, so a retried refund of the same
      // refund row never issues a second refund.
      refund.idempotencyKey ? { idempotencyKey: refund.idempotencyKey } : undefined
    )
    return { success: true, providerRefundId: result.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Stripe refund failed' }
  }
}

// Did a refund we are unsure about actually happen?
//
// Used only by the stale-PENDING reconciler: a refund row can be left in limbo if
// the process died after the provider call was issued but before the outcome was
// written. Rather than guess (and guessing wrong means either refunding twice or
// telling a customer they were refunded when they were not), ask Stripe.
//
// Matched on the shpRefundId metadata stamped at creation, which is the refund
// row id. Returns 'unknown' whenever we cannot answer confidently - the caller
// must leave the row alone in that case.
async function getRefundStatus(refundRowId: string, providerReference: string | null): Promise<ShpRefundStatusLookup> {
  if (!providerReference) return { status: 'unknown' }
  const stripe = await getStripe()
  try {
    const refunds = await stripe.refunds.list({ payment_intent: providerReference, limit: 100 })
    const match = refunds.data.find((r) => r.metadata?.shpRefundId === refundRowId)
    if (!match) {
      // Nothing carrying our id on a payment intent whose refunds we can see: the
      // request never landed. Safe to call failed - a refund Stripe has no record
      // of did not move any money.
      return { status: 'failed' }
    }
    if (match.status === 'succeeded') return { status: 'succeeded', providerRefundId: match.id }
    if (match.status === 'failed' || match.status === 'canceled') return { status: 'failed' }
    // 'pending' / 'requires_action' - still in flight, ask again next run.
    return { status: 'unknown' }
  } catch {
    return { status: 'unknown' }
  }
}

// Signature-verified, unauthenticated webhook receiver. Handles the three
// events spec 7.1 lists; any other event type is acknowledged and ignored.
async function handleWebhook(req: Request): Promise<ShpWebhookResult> {
  const signature = req.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!signature || !secret) return { error: 'Webhook not configured' }

  const rawBody = await req.text()
  const stripe = await getStripe()

  let event: import('stripe').default.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch (err) {
    return { error: `Signature verification failed: ${err instanceof Error ? err.message : 'unknown error'}` }
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as import('stripe').default.PaymentIntent
    const orderId = intent.metadata?.shpOrderId
    if (!orderId) return { error: 'Missing shpOrderId metadata' }
    return { orderId, status: 'PAID', providerReference: intent.id }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as import('stripe').default.PaymentIntent
    const orderId = intent.metadata?.shpOrderId
    if (!orderId) return { error: 'Missing shpOrderId metadata' }
    return { orderId, status: 'FAILED' }
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object as import('stripe').default.Charge
    // The shpOrderId metadata is only ever set on the PaymentIntent, and Stripe
    // does NOT copy it onto the Charge - so resolve the order via the charge's
    // payment_intent (the reference we stored when the order was marked paid)
    // rather than charge.metadata, which is always empty here.
    const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
    if (!paymentIntentId) return {}
    const order = await getOrderByPaymentReference(paymentIntentId)
    if (!order) return {}
    return { orderId: order.id, status: charge.refunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED' }
  }

  return {}
}

export const stripeProvider: ShpPaymentProvider = {
  id: 'STRIPE',
  label: 'Stripe',
  createIntent,
  confirmPayment,
  refundOrder,
  handleWebhook,
  getRefundStatus,
}
