// PROTECTED - Stripe payment provider integration (spec 7.1). Server always
// re-validates the PaymentIntent's own status/amount/currency before trusting
// a client-reported "confirmed" - never trust the client alone.
import type {
  ShpOrderDraft, ShpPaymentIntent, ShpPaymentProvider, ShpPaymentResult, ShpRefundRequest, ShpRefundResult, ShpRefundStatusLookup, ShpWebhookResult,
} from '@/modules/shop/lib/payments/provider'
import { getOrderByPaymentReference } from '@/modules/shop/lib/db/orders'
import { stripeLogo } from '@/modules/shop/lib/payments/logos'
import { getSiteUrlOrNull } from '@/lib/config/env'

// Which site took a payment, stamped on the intent. Stripe sends every event on
// an account to every endpoint on it, so a second site sharing the account sees
// this site's payments arrive at its webhook with order ids it has never heard
// of. Only a payment carrying this site's own mark may be reported as one whose
// order has gone missing (recordOrphanedPayment); anything else is somebody
// else's sale.
function siteMarker(): string | null {
  const url = getSiteUrlOrNull()
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

let stripeClient: import('stripe').default | null = null

async function getStripe(): Promise<import('stripe').default> {
  if (stripeClient) return stripeClient
  // Said in plain words, and before the SDK is asked. Handed an empty key it
  // refuses with "Neither apiKey nor config.authenticator provided", which is
  // what an owner saw in the refund box, and what a card order still in flight
  // when the key was taken out hit on its way to being confirmed. The checkout
  // itself never gets here - it stops offering card payments the moment the
  // key is missing (see isStripeConfigured) - so this is only ever read by
  // someone looking after an order that already exists.
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('Stripe is not set up on this site: the Stripe secret key is missing.')
  const { default: Stripe } = await import('stripe')
  // No apiVersion pinned - uses the account's dashboard-configured default
  // rather than guessing a literal date string the installed SDK major might reject.
  stripeClient = new Stripe(secretKey)
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
    metadata: { shpOrderId: order.orderId, shpOrderNumber: order.orderNumber, ...(siteMarker() ? { shpSite: siteMarker() as string } : {}) },
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
  // Declined only where Stripe says so about this order's own intent: an attempt
  // that was made and refused (it drops back to needing a payment method, with
  // the refusal recorded on it), or an intent that has been cancelled. An intent
  // still 'processing' is not a failure at all - the webhook settles it - and
  // one nobody has tried to pay yet has not failed either.
  if (intent.status !== 'succeeded' && intent.status !== 'processing') {
    const declined = intent.status === 'canceled' || (intent.status === 'requires_payment_method' && intent.last_payment_error != null)
    return { success: false, declined, error: `Payment not completed (status: ${intent.status})` }
  }
  if (intent.amount !== toMinorUnits(order.amount)) return { success: false, error: 'Payment amount does not match this order' }
  if (intent.currency !== order.currency.toLowerCase()) return { success: false, error: 'Payment currency does not match this order' }

  // Still processing: the money is committed and settling, and the webhook marks
  // the order paid (or failed) when Stripe knows. Reported as pending, so the
  // order waits at AWAITING_CONFIRMATION and the shopper is told it is on its
  // way - answering "payment not completed" here told somebody who had paid that
  // they had not, which is how a shopper ends up paying twice.
  if (intent.status === 'processing') return { success: true, pending: true, providerReference: intent.id }

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
    // What was actually taken, not what was asked for, so the route can hold
    // the order if it is not the order's total (see webhook-amount.ts).
    return {
      orderId,
      status: 'PAID',
      providerReference: intent.id,
      paidAmount: { minorUnits: intent.amount_received, currency: intent.currency },
      // Only for a payment this site took - see siteMarker.
      orderNumber: intent.metadata?.shpSite && intent.metadata.shpSite === siteMarker() ? intent.metadata.shpOrderNumber : undefined,
    }
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
    return {
      orderId: order.id,
      status: charge.refunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      // Stripe's running total of everything refunded on this charge, in pence.
      refundedTotal: (charge.amount_refunded / 100).toFixed(2),
    }
  }

  return {}
}

export const stripeProvider: ShpPaymentProvider = {
  id: 'STRIPE',
  label: 'Stripe',
  description: 'Credit and debit card payments are securely handled by our payment partner Stripe.',
  logo: stripeLogo,
  createIntent,
  confirmPayment,
  refundOrder,
  handleWebhook,
  getRefundStatus,
}
