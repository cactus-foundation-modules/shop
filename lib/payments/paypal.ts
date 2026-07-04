// PROTECTED - PayPal payment provider integration (spec 7.2). Raw REST calls,
// no SDK dependency, to keep the bundle lean (spec's own instruction).
import { getPayPalApiBase } from '@/modules/shop/lib/env'
import type {
  ShpOrderDraft, ShpPaymentIntent, ShpPaymentProvider, ShpPaymentResult, ShpRefundRequest, ShpRefundResult, ShpWebhookResult,
} from '@/modules/shop/lib/payments/provider'

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
  const token = await getAccessToken()
  return fetch(`${getPayPalApiBase()}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
}

async function createIntent(order: ShpOrderDraft): Promise<ShpPaymentIntent> {
  const res = await paypalFetch('/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: order.orderId,
        custom_id: order.orderId,
        amount: { currency_code: order.currency, value: order.amount.toFixed(2) },
      }],
    }),
  })
  if (!res.ok) throw new Error(`PayPal order create failed: ${res.status}`)
  const data = (await res.json()) as { id: string; links: Array<{ rel: string; href: string }> }
  const approvalUrl = data.links.find((l) => l.rel === 'approve')?.href
  return { providerOrderId: data.id, approvalUrl }
}

// Captures the approved PayPal Order server-side.
async function confirmPayment(order: ShpOrderDraft, payload: unknown): Promise<ShpPaymentResult> {
  const body = payload as { paypalOrderId?: string } | null
  const paypalOrderId = body?.paypalOrderId
  if (!paypalOrderId) return { success: false, error: 'Missing paypalOrderId' }

  const res = await paypalFetch(`/v2/checkout/orders/${paypalOrderId}/capture`, { method: 'POST' })
  if (!res.ok) return { success: false, error: `PayPal capture failed: ${res.status}` }
  const data = (await res.json()) as {
    status: string
    purchase_units: Array<{
      custom_id?: string
      payments?: { captures?: Array<{ id: string; amount?: { value: string; currency_code: string } }> }
    }>
  }
  if (data.status !== 'COMPLETED') return { success: false, error: `Capture not completed (status: ${data.status})` }
  const customId = data.purchase_units[0]?.custom_id
  if (customId !== order.orderId) return { success: false, error: 'PayPal order does not match this order' }
  const capture = data.purchase_units[0]?.payments?.captures?.[0]
  if (capture?.amount) {
    if (Number(capture.amount.value) !== Number(order.amount.toFixed(2))) return { success: false, error: 'Payment amount does not match this order' }
    if (capture.amount.currency_code !== order.currency) return { success: false, error: 'Payment currency does not match this order' }
  }
  return { success: true, providerReference: capture?.id ?? paypalOrderId }
}

async function refundOrder(refund: ShpRefundRequest): Promise<ShpRefundResult> {
  try {
    const res = await paypalFetch(`/v2/payments/captures/${refund.providerReference}/refund`, {
      method: 'POST',
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

  const event = JSON.parse(rawBody) as { event_type: string; resource: { custom_id?: string; id: string } }

  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    const orderId = event.resource.custom_id
    if (!orderId) return { error: 'Missing custom_id' }
    return { orderId, status: 'PAID', providerReference: event.resource.id }
  }

  if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
    const orderId = event.resource.custom_id
    if (!orderId) return {}
    return { orderId, status: 'REFUNDED' }
  }

  return {}
}

export const paypalProvider: ShpPaymentProvider = {
  id: 'PAYPAL',
  label: 'PayPal',
  createIntent,
  confirmPayment,
  refundOrder,
  handleWebhook,
}
