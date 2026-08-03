'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getCart } from '@/modules/shop/components/public/cart'
import { getCheckoutState, updateCheckoutState, isContactAndShippingComplete } from '@/modules/shop/components/public/checkout-state'
import { useCartPopulated } from '@/modules/shop/components/public/use-cart-populated'

type ShopClientConfig = {
  enabledPaymentMethods: string[]
  paymentMethodLabels?: Record<string, string>
  stripePublishableKey: string | null
  currencySymbol: string
  // Optional so a response from an older cached bundle still works - the
  // fallback is the rule as it was before the business-name box existed.
  businessName?: { required?: boolean }
}

// The pending order + provider intent that "Place order" will act on. Held for
// the mount that created it: a page reload (or a trip off-site and back) throws
// it away deliberately, because the order it points at belongs to an attempt the
// shopper walked away from.
type PreparedPayment = {
  method: string
  orderId: string
  orderNumber: string
  approvalUrl?: string
  providerOrderId?: string
}

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
export function CheckoutPaymentClient({ preview = false }: { preview?: boolean }) {
  const populated = useCartPopulated(preview)
  const [config, setConfig] = useState<ShopClientConfig | null>(null)
  const [method, setMethod] = useState<string | null>(getCheckoutState().paymentMethod)
  const [instructions, setInstructions] = useState<string | null>(null)
  // Sentences an installed module offered about what this payment method means
  // for this order - a pay-later method's effect on delivery dates, say. Shop
  // only prints them; see lib/order-payment-state.ts.
  const [notes, setNotes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const elementsRef = useRef<HTMLDivElement>(null)
  const stripeInstanceRef = useRef<ReturnType<NonNullable<typeof window.Stripe>> | null>(null)
  const stripeElementsRef = useRef<unknown>(null)
  const preparedRef = useRef<PreparedPayment | null>(null)

  useEffect(() => {
    fetch('/api/m/shop/public/config').then((r) => r.json()).then(setConfig)
  }, [])

  // Creates the pending order and the provider intent, then gets the on-page
  // part of the method ready - the Stripe card fields, or the manual payment
  // instructions. It deliberately never navigates: a provider that hands back an
  // approval URL is only visited from "Place order" (see placeOrder below), so
  // that picking a radio button cannot dump the shopper on someone else's site
  // before they have seen their total.
  const prepareIntent = useCallback(async (next: string): Promise<PreparedPayment> => {
    const state = getCheckoutState()
    const lines = getCart()
    setLoading(true)
    try {
      const res = await fetch('/api/m/shop/public/checkout/payment-intent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines, customerEmail: state.customerEmail, customerName: state.customerName, customerPhone: state.customerPhone || undefined,
          shippingAddress: state.shippingAddress, shippingRateId: state.shippingRateId, couponCode: state.couponCode, paymentMethod: next,
          // Which tickboxes the shopper ticked on the review step. Sent as ids,
          // never as statements: the wording the order records has to be the
          // shop's own copy of it, not whatever the browser claims it read.
          agreements: state.agreements,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not start checkout')

      sessionStorage.setItem('cactus_shop_order_id', data.orderId)
      sessionStorage.setItem('cactus_shop_order_number', data.orderNumber)

      setNotes(Array.isArray(data.notes) ? data.notes.filter((n: unknown): n is string => typeof n === 'string' && n.length > 0) : [])

      if (next === 'STRIPE' && data.clientSecret && config?.stripePublishableKey) {
        await loadStripeJs()
        const stripe = window.Stripe!(config.stripePublishableKey)
        stripeInstanceRef.current = stripe
        const elements = stripe.elements({ clientSecret: data.clientSecret })
        stripeElementsRef.current = elements
        if (elementsRef.current) elements.create('payment').mount(elementsRef.current)
      } else if (data.instructions) {
        setInstructions(data.instructions)
      }

      const prepared: PreparedPayment = {
        method: next,
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        approvalUrl: data.approvalUrl,
        providerOrderId: data.providerOrderId,
      }
      preparedRef.current = prepared
      return prepared
    } finally {
      setLoading(false)
    }
  }, [config])

  async function chooseMethod(next: string) {
    const state = getCheckoutState()
    if (!isContactAndShippingComplete(state, { businessNameRequired: config?.businessName?.required === true })) {
      setError('Please fill in your contact and shipping details above before choosing a payment method.')
      return
    }

    setMethod(next)
    setError(null)
    // Instructions belong to the method that was showing a moment ago - leaving
    // bank details on screen under a card form is its own small lie. The same
    // goes for anything a module said about the old method.
    setInstructions(null)
    setNotes([])
    preparedRef.current = null
    updateCheckoutState({ paymentMethod: next })

    try {
      await prepareIntent(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout')
    }
  }

  // The Review block's "Place order" button dispatches this event - the actual
  // Stripe/manual confirmation logic lives here since this is the block that
  // holds the mounted Elements instance (Puck blocks don't share React state).
  useEffect(() => {
    async function placeOrder() {
      if (!method) {
        window.dispatchEvent(new CustomEvent('cactus-shop-order-error', { detail: 'Please choose a payment method first.' }))
        return
      }

      try {
        // A method restored from a previous visit (reload, or off to the bank and
        // back) has no live intent in this mount, and the order left behind in
        // sessionStorage belongs to that abandoned attempt. Confirming that one
        // would wave the shopper through to the confirmation page without a penny
        // changing hands, so start a fresh payment instead.
        let prepared = preparedRef.current
        const freshlyPrepared = !prepared || prepared.method !== method
        if (freshlyPrepared) prepared = await prepareIntent(method)
        if (!prepared) throw new Error('Could not start checkout')

        // Providers that authorise on their own site (PayPal, open banking).
        // This is the one and only place that hands the shopper over, and it
        // happens on "Place order" - never on picking the radio button.
        if (prepared.approvalUrl) {
          if (method === 'PAYPAL') sessionStorage.setItem('cactus_shop_paypal_order_id', prepared.providerOrderId ?? '')
          window.location.href = prepared.approvalUrl
          return
        }

        let payload: unknown = {}
        if (method === 'STRIPE') {
          // A card form that was only just mounted is necessarily empty, so ask
          // rather than submit a blank card and relay Stripe's error for it.
          if (freshlyPrepared) throw new Error('Please enter your card details, then place your order.')
          const stripe = stripeInstanceRef.current
          if (!stripe || !stripeElementsRef.current) throw new Error('Payment form not ready')
          const result = await stripe.confirmPayment({ elements: stripeElementsRef.current, confirmParams: { return_url: window.location.href }, redirect: 'if_required' })
          if (result.error) throw new Error(result.error.message)
          payload = { paymentIntentId: result.paymentIntent?.id }
        }

        const res = await fetch('/api/m/shop/public/checkout/confirm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: prepared.orderId, payload }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Payment could not be confirmed')

        const customerEmail = getCheckoutState().customerEmail

        // Deliberately does NOT empty the basket here. Emptying it fires the
        // cart subscription, every block on this page decides checkout has
        // nothing to sell, and the shopper watches their order turn into "Your
        // basket is empty" for the length of a page load - having just paid.
        // The confirmation page clears it on arrival instead (see
        // clearPlacedOrderState), which is already how a shopper coming back
        // from PayPal or their bank gets emptied, and it has the better
        // instinct besides: a payment that comes back failed keeps its basket.
        window.location.href = `/shop/checkout/confirmation?orderNumber=${encodeURIComponent(prepared.orderNumber)}&email=${encodeURIComponent(customerEmail)}`
      } catch (err) {
        window.dispatchEvent(new CustomEvent('cactus-shop-order-error', { detail: err instanceof Error ? err.message : 'Payment failed' }))
      }
    }

    window.addEventListener('cactus-shop-place-order', placeOrder)
    return () => window.removeEventListener('cactus-shop-place-order', placeOrder)
  }, [method, prepareIntent])

  // Empty basket: nothing to pay for. Rendering payment methods here invites a
  // click that can only end in an error from the payment-intent route.
  if (!populated) return null

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
      {/* What this method means for the order, from whichever module knows -
          above the pay-here fields, because it is a consequence of the choice
          just made rather than part of paying. */}
      {notes.length > 0 && (
        <div
          role="note"
          style={{
            display: 'grid', gap: '0.375rem', margin: 0, padding: '0.625rem 0.75rem',
            border: '1px solid var(--color-info-border)', borderRadius: 6,
            background: 'var(--color-info-subtle)', color: 'var(--color-text)', fontSize: '0.875rem',
          }}
        >
          {notes.map((note, i) => <p key={i} style={{ margin: 0 }}>{note}</p>)}
        </div>
      )}
      {method === 'STRIPE' && (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <div ref={elementsRef} />
          {/* Reassurance sits with the card fields - the point of anxiety - not
              in a footer nobody reads. */}
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', margin: 0 }}>
            🔒 Card details go straight to the payment provider, encrypted - they never touch this site.
          </p>
        </div>
      )}
      {instructions && <p style={{ whiteSpace: 'pre-wrap', color: 'var(--color-text-muted)' }}>{instructions}</p>}
    </section>
  )
}
