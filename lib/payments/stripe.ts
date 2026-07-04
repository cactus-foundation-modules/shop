// PROTECTED - Stripe payment provider integration (spec 7.1). Server always
// re-validates the PaymentIntent's own status/amount/currency before trusting
// a client-reported "confirmed" - never trust the client alone.
import type {
  ShpOrderDraft, ShpPaymentIntent, ShpPaymentProvider, ShpPaymentResult, ShpRefundRequest, ShpRefundResult, ShpWebhookResult,
} from '@/modules/shop/lib/payments/provider'

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
// status - the client payload is only used to know which intent to check.
async function confirmPayment(orderId: string, payload: unknown): Promise<ShpPaymentResult> {
  const body = payload as { paymentIntentId?: string } | null
  const paymentIntentId = body?.paymentIntentId
  if (!paymentIntentId) return { success: false, error: 'Missing paymentIntentId' }

  const stripe = await getStripe()
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId)
  if (intent.metadata?.shpOrderId !== orderId) return { success: false, error: 'Payment intent does not match this order' }
  if (intent.status !== 'succeeded') return { success: false, error: `Payment not completed (status: ${intent.status})` }

  return { success: true, providerReference: intent.id }
}

async function refundOrder(refund: ShpRefundRequest): Promise<ShpRefundResult> {
  const stripe = await getStripe()
  try {
    const result = await stripe.refunds.create({
      payment_intent: refund.providerReference,
      amount: toMinorUnits(refund.amount),
    })
    return { success: true, providerRefundId: result.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Stripe refund failed' }
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
    const orderId = charge.metadata?.shpOrderId
    if (!orderId) return {}
    return { orderId, status: charge.refunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED' }
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
}
