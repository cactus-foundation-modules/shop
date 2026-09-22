// PROTECTED - PayPal payment provider integration (spec 7.2). Raw REST calls,
// no SDK dependency, to keep the bundle lean (spec's own instruction).
import { getPayPalApiBase } from '@/modules/shop/lib/env'
import { getSiteUrl } from '@/lib/config/env'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { signOrderReceiptToken } from '@/modules/shop/lib/order-receipt-token'
import type {
  ShpOrderDraft, ShpPaymentIntent, ShpPaymentProvider, ShpPaymentResult, ShpRefundRequest, ShpRefundResult, ShpWebhookResult,
} from '@/modules/shop/lib/payments/provider'
import { paypalLogo } from '@/modules/shop/lib/payments/logos'
import { decimalToMinorUnits } from '@/modules/shop/lib/payments/webhook-amount'

let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token

  const clientId = process.env.PAYPAL_CLIENT_ID ?? ''
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET ?? ''
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(`${getPayPalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`PayPal OAuth failed: ${res.status}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 }
  return cachedToken.token
}

async function paypalFetch(path: string, init: RequestInit): Promise<Response> {
  const send = (token: string) => fetch(`${getPayPalApiBase()}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  const res = await send(await getAccessToken())
  // The token above is held for the life of a warm instance, and PayPal can stop
  // honouring it before it says it will - the secret rotated, the app's access
  // revoked. Every call on that instance then failed until the clock ran out.
  // A 401 is PayPal refusing the token itself, before it did anything with the
  // request, so asking once more with a fresh one cannot do anything twice.
  if (res.status !== 401) return res
  cachedToken = null
  return send(await getAccessToken())
}

// The query parameter the confirmation page looks for to know it has been
// handed back by PayPal, carrying the shop's own order id. PayPal adds its own
// `token` (its order id) and `PayerID` alongside. Read by
// components/public/OrderConfirmationClient.tsx, which spells it out itself
// rather than importing it: that is a client file, and importing this one would
// drag the secret-holding half of PayPal into the browser. Keep the two in step.
const PAYPAL_RETURN_PARAM = 'paypalReturn'

async function createIntent(order: ShpOrderDraft): Promise<ShpPaymentIntent> {
  // Where PayPal puts the buyer down afterwards. Without these PayPal had
  // nowhere to send anybody, so an approved payment was never captured and the
  // order sat unpaid for good. The confirmation page is the one place with
  // everything needed to finish the job: the signed receipt token opens it, and
  // the shop's order id lets it ask the confirm route to capture. Absolute,
  // because PayPal insists, and always this site's own address.
  const siteUrl = getSiteUrl()
  const returnUrl =
    `${siteUrl}/shop/checkout/confirmation` +
    `?orderNumber=${encodeURIComponent(order.orderNumber)}` +
    `&t=${encodeURIComponent(signOrderReceiptToken(order.orderNumber))}` +
    `&${PAYPAL_RETURN_PARAM}=${encodeURIComponent(order.orderId)}`

  const res = await paypalFetch('/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: order.orderId,
        custom_id: order.orderId,
        amount: { currency_code: order.currency, value: order.amount.toFixed(2) },
      }],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: returnUrl,
            // Back to checkout with the basket intact. The order left behind is
            // unpaid and pruned in the usual way; the next "Place order" starts
            // a fresh one, since a prepared payment never outlives its page.
            cancel_url: `${siteUrl}/shop/checkout`,
            // The money is taken the moment they land back here, so PayPal's
            // button should say so rather than "Continue".
            user_action: 'PAY_NOW',
          },
        },
      },
    }),
  })
  if (!res.ok) throw new Error(`PayPal order create failed: ${res.status}`)
  const data = (await res.json()) as { id: string; links: Array<{ rel: string; href: string }> }
  // `payer-action` is what PayPal calls the approval link once the request
  // carries a payment_source; `approve` is the older name, kept as a fallback.
  const approvalUrl = data.links.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href
  return { providerOrderId: data.id, approvalUrl }
}

type PayPalOrderBody = {
  status: string
  purchase_units: Array<{
    custom_id?: string
    payments?: { captures?: Array<{ id: string; amount?: { value: string; currency_code: string } }> }
  }>
}

// Whether PayPal refused the capture because it had already been done - a
// reload of the return page, or a second tab, getting there after the first.
async function isAlreadyCaptured(res: Response): Promise<boolean> {
  if (res.status !== 422) return false
  const body = (await res.json().catch(() => null)) as { details?: Array<{ issue?: string }> } | null
  return body?.details?.some((d) => d.issue === 'ORDER_ALREADY_CAPTURED') ?? false
}

// Captures the approved PayPal Order server-side.
async function confirmPayment(order: ShpOrderDraft, payload: unknown): Promise<ShpPaymentResult> {
  const body = payload as { paypalOrderId?: string } | null
  const paypalOrderId = body?.paypalOrderId
  if (!paypalOrderId) return { success: false, error: 'Missing paypalOrderId' }
  // Pasted into a path below, and it came off a query string.
  if (!/^[A-Z0-9]{1,64}$/i.test(paypalOrderId)) return { success: false, error: 'Invalid paypalOrderId' }

  let res = await paypalFetch(`/v2/checkout/orders/${paypalOrderId}/capture`, { method: 'POST' })
  // Captured already, by an earlier attempt whose answer never made it back.
  // Read the order instead and run it through exactly the same checks: the
  // money was taken, and calling that a refusal would tell a buyer who has paid
  // that they have not.
  if (!res.ok && await isAlreadyCaptured(res)) {
    res = await paypalFetch(`/v2/checkout/orders/${paypalOrderId}`, { method: 'GET' })
  }
  // Never `declined`. A refused capture (a declined funding source, most often)
  // is recovered by sending the buyer back to PayPal to choose another way to
  // pay against the same PayPal order, so the shop's order stays unpaid rather
  // than failed - and nothing in this response proves the PayPal order was this
  // order's to begin with.
  if (!res.ok) return { success: false, error: `PayPal capture failed: ${res.status}` }
  const data = (await res.json()) as PayPalOrderBody
  if (data.status !== 'COMPLETED') return { success: false, error: `Capture not completed (status: ${data.status})` }
  const customId = data.purchase_units[0]?.custom_id
  if (customId !== order.orderId) return { success: false, error: 'PayPal order does not match this order' }
  const capture = data.purchase_units[0]?.payments?.captures?.[0]
  // Never confirm without validating the captured amount - a missing amount
  // object must fail closed, not skip the check and mark the order paid.
  if (!capture?.amount) return { success: false, error: 'Capture amount missing - cannot verify payment' }
  if (Number(capture.amount.value) !== Number(order.amount.toFixed(2))) return { success: false, error: 'Payment amount does not match this order' }
  if (capture.amount.currency_code !== order.currency) return { success: false, error: 'Payment currency does not match this order' }
  return { success: true, providerReference: capture.id ?? paypalOrderId }
}

async function refundOrder(refund: ShpRefundRequest): Promise<ShpRefundResult> {
  try {
    const res = await paypalFetch(`/v2/payments/captures/${refund.providerReference}/refund`, {
      method: 'POST',
      // PayPal-Request-Id makes the refund idempotent: a retry with the same key
      // returns the original refund rather than issuing a second one.
      headers: refund.idempotencyKey ? { 'PayPal-Request-Id': refund.idempotencyKey } : {},
      body: JSON.stringify({ amount: { currency_code: refund.currency, value: refund.amount.toFixed(2) } }),
    })
    if (!res.ok) return { success: false, error: `PayPal refund failed: ${res.status}` }
    const data = (await res.json()) as { id: string }
    return { success: true, providerRefundId: data.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'PayPal refund failed' }
  }
}

// Verifies via PayPal's own verify-webhook-signature endpoint (no local
// crypto - PayPal is the source of truth for whether a webhook is genuine).
async function verifyWebhookSignature(req: Request, rawBody: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID
  if (!webhookId) return false

  const res = await paypalFetch('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify({
      auth_algo: req.headers.get('paypal-auth-algo'),
      cert_url: req.headers.get('paypal-cert-url'),
      transmission_id: req.headers.get('paypal-transmission-id'),
      transmission_sig: req.headers.get('paypal-transmission-sig'),
      transmission_time: req.headers.get('paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    }),
  })
  if (!res.ok) return false
  const data = (await res.json()) as { verification_status: string }
  return data.verification_status === 'SUCCESS'
}

async function handleWebhook(req: Request): Promise<ShpWebhookResult> {
  const rawBody = await req.text()
  const verified = await verifyWebhookSignature(req, rawBody)
  if (!verified) return { error: 'Webhook signature verification failed' }

  const event = JSON.parse(rawBody) as {
    event_type: string
    resource: {
      custom_id?: string
      id: string
      amount?: { value?: string; currency_code?: string }
      seller_payable_breakdown?: { total_refunded_amount?: { value?: string } }
    }
  }

  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    const orderId = event.resource.custom_id
    if (!orderId) return { error: 'Missing custom_id' }
    // What the capture actually took, for the route to check against the order
    // (see webhook-amount.ts). Read from PayPal's decimal string, never via a
    // float; left off altogether when PayPal does not say, which settles the
    // order as it always was.
    const value = event.resource.amount?.value
    const currency = event.resource.amount?.currency_code
    const minorUnits = value ? decimalToMinorUnits(value) : null
    return {
      orderId,
      status: 'PAID',
      providerReference: event.resource.id,
      ...(minorUnits !== null && currency ? { paidAmount: { minorUnits, currency } } : {}),
    }
  }

  if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
    const orderId = event.resource.custom_id
    if (!orderId) return {}

    // PayPal fires this same event for a PARTIAL refund, so reporting REFUNDED
    // unconditionally marked a £200 order fully refunded off the back of a £5
    // refund. There is no "fully refunded" flag on the resource (unlike Stripe's
    // charge.refunded), so compare what PayPal says has been refunded in total
    // against what the order was actually charged.
    //
    // seller_payable_breakdown.total_refunded_amount is CUMULATIVE across every
    // refund on that capture, which is what we want - a second partial refund
    // that happens to complete the order still resolves to REFUNDED. Where it is
    // absent, fall back to this refund's own amount, which is correct for the
    // common single-refund case and errs towards PARTIALLY_REFUNDED otherwise.
    const order = await getOrderById(orderId)
    if (!order) return {}

    const refundedSoFar = Number(
      event.resource.seller_payable_breakdown?.total_refunded_amount?.value ?? event.resource.amount?.value ?? '0'
    )
    const orderTotal = Number(order.total)
    if (!Number.isFinite(refundedSoFar) || !Number.isFinite(orderTotal) || orderTotal <= 0) {
      // Cannot tell. Say partial rather than declaring an order fully refunded
      // on a number we do not trust - understating is the recoverable direction.
      return { orderId, status: 'PARTIALLY_REFUNDED' }
    }

    // Penny tolerance for rounding on the way through PayPal.
    const fully = refundedSoFar + 0.01 >= orderTotal
    return {
      orderId,
      status: fully ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      // Cumulative only when PayPal gave the breakdown; this refund's own
      // amount otherwise, which is the same thing on the common single refund.
      refundedTotal: refundedSoFar.toFixed(2),
    }
  }

  return {}
}

export const paypalProvider: ShpPaymentProvider = {
  id: 'PAYPAL',
  label: 'PayPal',
  description: 'Pay with your PayPal balance, bank account or card - PayPal handles the payment securely.',
  logo: paypalLogo,
  createIntent,
  confirmPayment,
  refundOrder,
  handleWebhook,
}
