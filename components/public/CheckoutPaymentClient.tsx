'use client'

import { useEffect, useRef, useState } from 'react'
import { getCart } from '@/modules/shop/components/public/cart'
import { getCheckoutState, updateCheckoutState, isContactAndShippingComplete } from '@/modules/shop/components/public/checkout-state'

type ShopClientConfig = { enabledPaymentMethods: string[]; paymentMethodLabels?: Record<string, string>; stripePublishableKey: string | null; currencySymbol: string }

// Preferred display names for the built-in methods (kept here so the wording
// stays exact); any other method falls back to the provider label from config,
// then the raw code.
const BUILT_IN_METHOD_LABELS: Record<string, string> = { STRIPE: 'Card (Stripe)', PAYPAL: 'PayPal', BANK_TRANSFER: 'Bank transfer', CASH: 'Cash' }

declare global {
  interface Window {
    Stripe?: (key: string) => {
      elements: (opts: { clientSecret: string }) => { create: (type: string) => { mount: (el: HTMLElement) => void } }
      confirmPayment: (opts: { elements: unknown; confirmParams: { return_url: string }; redirect: 'if_required' }) => Promise<{ error?: { message: string }; paymentIntent?: { id: string; status: string } }>
    }
  }
}

function loadStripeJs(): Promise<void> {
  if (window.Stripe) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://js.stripe.com/v3/'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Stripe.js'))
    document.head.appendChild(script)
  })
}

// Client island for the checkout payment step (holds the mounted Stripe Elements
// instance). Registered Puck block wrapper (ShopCheckoutPayment) is a server
// component that renders this, so Puck's RSC <Render> never serialises its
// renderDropZone function bag into the client.
export function CheckoutPaymentClient() {
  const [config, setConfig] = useState<ShopClientConfig | null>(null)
  const [method, setMethod] = useState<string | null>(getCheckoutState().paymentMethod)
  const [instructions, setInstructions] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const elementsRef = useRef<HTMLDivElement>(null)
  const stripeInstanceRef = useRef<ReturnType<NonNullable<typeof window.Stripe>> | null>(null)
  const stripeElementsRef = useRef<unknown>(null)

  useEffect(() => {
    fetch('/api/m/shop/public/config').then((r) => r.json()).then(setConfig)
  }, [])

  async function chooseMethod(next: string) {
    const state = getCheckoutState()
    if (!isContactAndShippingComplete(state)) {
      setError('Please fill in your contact and shipping details above before choosing a payment method.')
      return
    }

    setMethod(next)
    setError(null)
    updateCheckoutState({ paymentMethod: next as never })

    const lines = getCart()
    setLoading(true)
    try {
      const res = await fetch('/api/m/shop/public/checkout/payment-intent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines, customerEmail: state.customerEmail, customerName: state.customerName, customerPhone: state.customerPhone || undefined,
          shippingAddress: state.shippingAddress, shippingRateId: state.shippingRateId, couponCode: state.couponCode, paymentMethod: next,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Could not start checkout'); return }

      sessionStorage.setItem('cactus_shop_order_id', data.orderId)
      sessionStorage.setItem('cactus_shop_order_number', data.orderNumber)

      if (next === 'STRIPE' && data.clientSecret && config?.stripePublishableKey) {
        await loadStripeJs()
        const stripe = window.Stripe!(config.stripePublishableKey)
        stripeInstanceRef.current = stripe
        const elements = stripe.elements({ clientSecret: data.clientSecret })
        stripeElementsRef.current = elements
        if (elementsRef.current) elements.create('payment').mount(elementsRef.current)
      } else if (data.approvalUrl) {
        // Any provider that returns an approval URL (PayPal, open-banking, ...)
        // sends the shopper off-site to authorise, then back to a return URL.
        if (next === 'PAYPAL') sessionStorage.setItem('cactus_shop_paypal_order_id', data.providerOrderId ?? '')
        window.location.href = data.approvalUrl
      } else if (data.instructions) {
        setInstructions(data.instructions)
      }
    } finally {
      setLoading(false)
    }
  }

  // The Review block's "Place order" button dispatches this event - the actual
  // Stripe/manual confirmation logic lives here since this is the block that
  // holds the mounted Elements instance (Puck blocks don't share React state).
  useEffect(() => {
    async function placeOrder() {
      const orderId = sessionStorage.getItem('cactus_shop_order_id')
      const orderNumber = sessionStorage.getItem('cactus_shop_order_number')
      if (!orderId || !method) {
        window.dispatchEvent(new CustomEvent('cactus-shop-order-error', { detail: 'Please choose a payment method first.' }))
        return
      }

      try {
        let payload: unknown = {}
        if (method === 'STRIPE') {
          const stripe = stripeInstanceRef.current
          if (!stripe || !stripeElementsRef.current) throw new Error('Payment form not ready')
          const result = await stripe.confirmPayment({ elements: stripeElementsRef.current, confirmParams: { return_url: window.location.href }, redirect: 'if_required' })
          if (result.error) throw new Error(result.error.message)
          payload = { paymentIntentId: result.paymentIntent?.id }
        }

        const res = await fetch('/api/m/shop/public/checkout/confirm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, payload }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Payment could not be confirmed')

        const customerEmail = getCheckoutState().customerEmail

        const { clearCart } = await import('@/modules/shop/components/public/cart')
        const { clearOrderSpecificState } = await import('@/modules/shop/components/public/checkout-state')
        clearCart()
        clearOrderSpecificState()
        window.location.href = `/shop/checkout/confirmation?orderNumber=${encodeURIComponent(orderNumber ?? '')}&email=${encodeURIComponent(customerEmail)}`
      } catch (err) {
        window.dispatchEvent(new CustomEvent('cactus-shop-order-error', { detail: err instanceof Error ? err.message : 'Payment failed' }))
      }
    }

    window.addEventListener('cactus-shop-place-order', placeOrder)
    return () => window.removeEventListener('cactus-shop-place-order', placeOrder)
  }, [method])

  return (
    <section style={{ display: 'grid', gap: '0.75rem', maxWidth: 480 }}>
      <h2 style={{ fontSize: '1.125rem', margin: 0 }}>Payment method</h2>
      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {(config?.enabledPaymentMethods ?? []).map((m) => (
          <label key={m} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
            <input type="radio" name="paymentMethod" checked={method === m} onChange={() => chooseMethod(m)} disabled={loading} />
            <span>{BUILT_IN_METHOD_LABELS[m] ?? config?.paymentMethodLabels?.[m] ?? m}</span>
          </label>
        ))}
      </div>
      {method === 'STRIPE' && <div ref={elementsRef} />}
      {instructions && <p style={{ whiteSpace: 'pre-wrap', color: 'var(--color-text-muted)' }}>{instructions}</p>}
    </section>
  )
}
