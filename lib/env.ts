// Presence checks for the payment provider env vars. Used to filter
// shopConfig.enabledPaymentMethods server-side so a method can never be
// offered at checkout without its keys actually being set (spec 7).

export function isStripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY)
}

export function isStripeWebhookConfigured(): boolean {
  return !!process.env.STRIPE_WEBHOOK_SECRET
}

export function isPayPalConfigured(): boolean {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)
}

export function isPayPalWebhookConfigured(): boolean {
  return !!process.env.PAYPAL_WEBHOOK_ID
}

export function getPayPalApiBase(): string {
  return process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'
}
