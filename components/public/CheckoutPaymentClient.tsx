'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getCart, subscribeCart } from '@/modules/shop/components/public/cart'
import {
  getCheckoutState, updateCheckoutState, isContactAndShippingComplete, areAgreementsAccepted, subscribeCheckoutState,
  rememberPlacedOrder,
  type CheckoutState,
} from '@/modules/shop/components/public/checkout-state'
import { formatUkPhone } from '@/modules/shop/lib/phone'
import { useCartPopulated } from '@/modules/shop/components/public/use-cart-populated'
import type { ShpPaymentLogo } from '@/modules/shop/lib/payments/provider'

type ShopClientConfig = {
  enabledPaymentMethods: string[]
  paymentMethodLabels?: Record<string, string>
  // Optional so a response from an older cached bundle still works: a checkout
  // with no logos in it is what every shop had until now.
  paymentMethodLogos?: Record<string, ShpPaymentLogo>
  // Same again for the line under each method's name. Already resolved by the
  // config route - the owner's wording where they wrote one, the provider's
  // where they did not - so there is nothing to work out here.
  paymentMethodDescriptions?: Record<string, string>
  stripePublishableKey: string | null
  currencySymbol: string
  // Optional so a response from an older cached bundle still works - the
  // fallback is the rule as it was before the business-name box existed.
  businessName?: { required?: boolean }
  // Whether the contact step's phone number is compulsory. Same reason as
  // above: the order-creating route refuses without one, so this block has to
  // know before it is worth calling.
  requirePhone?: boolean
  // The review step's tickboxes. Needed here because the route that creates the
  // order refuses one with a compulsory box unticked, so this block has to know
  // when it is worth calling at all.
  checkoutAgreements?: { id: string; required: boolean }[]
}

// The pending order + provider intent that "Place order" will act on. Held for
// the mount that created it: a page reload (or a trip off-site and back) throws
// it away deliberately, because the order it points at belongs to an attempt the
// shopper walked away from.
type PreparedPayment = {
  method: string
  orderId: string
  orderNumber: string
  receiptToken: string
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

// The height every brand mark is drawn at, whatever shape it is. Marks come in
// all proportions, so matching their heights is the only thing that makes a
// column of them look deliberate.
const LOGO_HEIGHT = 20

// A payment provider's brand mark, beside the method's name. Where the provider
// gives a dark-theme colourway, both images are rendered and core's logo-swap
// CSS hides the wrong one before paint - which is also why `display` is left out
// of the inline style here: setting it would beat that stylesheet rule and show
// both at once.
function PaymentMethodLogo({ logo }: { logo: ShpPaymentLogo }) {
  const width = logo.height > 0 ? Math.round((logo.width / logo.height) * LOGO_HEIGHT) : LOGO_HEIGHT
  const style = { height: LOGO_HEIGHT, width: 'auto', flex: '0 0 auto' } as const
  const alt = logo.alt ?? ''
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URI shipped by the payment module itself, nothing for the image optimiser to fetch */}
      <img src={logo.light} alt={alt} width={width} height={LOGO_HEIGHT} style={style} data-logo-variant={logo.dark ? 'light' : undefined} />
      {logo.dark && (
        // eslint-disable-next-line @next/next/no-img-element -- as above
        <img src={logo.dark} alt={alt} width={width} height={LOGO_HEIGHT} style={style} data-logo-variant="dark" />
      )}
    </>
  )
}

// Client island for the checkout payment step (holds the mounted Stripe Elements
// instance). Registered Puck block wrapper (ShopCheckoutPayment) is a server
// component that renders this, so Puck's RSC <Render> never serialises its
// renderDropZone function bag into the client.
export function CheckoutPaymentClient({ preview = false, heading }: { preview?: boolean; heading?: string }) {
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
  // What the rest of the checkout still owes before this method can be set up.
  // Shown as a note beside the chosen method, never as a refusal to choose it.
  const [awaiting, setAwaiting] = useState<'details' | 'agreements' | null>(null)
  const elementsRef = useRef<HTMLDivElement>(null)
  const stripeInstanceRef = useRef<ReturnType<NonNullable<typeof window.Stripe>> | null>(null)
  const stripeElementsRef = useRef<unknown>(null)
  const preparedRef = useRef<PreparedPayment | null>(null)
  const preparingRef = useRef(false)
  // The choice the current prepare attempt belongs to. Every attempt creates a
  // real order and a real provider intent, so a choice gets exactly one - a
  // shopper still typing their address must not leave a trail of pending orders.
  const attemptedForRef = useRef<string | null>(null)
  // Only a method picked during this mount is prepared on its own. One restored
  // from sessionStorage on a fresh page load is deliberately left alone: a
  // reload would otherwise create a pending order and a live provider intent
  // before the shopper had touched anything.
  const pickedThisMountRef = useRef(false)

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
          // Canonical form, not as typed: the number may have been written into
          // storage by an older visit that never went through the contact box's
          // own tidy-up. The route normalises it again regardless.
          lines, customerEmail: state.customerEmail, customerName: state.customerName,
          customerPhone: (formatUkPhone(state.customerPhone) ?? state.customerPhone) || undefined,
          shippingAddress: state.shippingAddress, shippingRateId: state.shippingRateId, couponCode: state.couponCode, paymentMethod: next,
          // Which tickboxes the shopper ticked on the review step. Sent as ids,
          // never as statements: the wording the order records has to be the
          // shop's own copy of it, not whatever the browser claims it read.
          agreements: state.agreements,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not start checkout')

      const prepared: PreparedPayment = {
        method: next,
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        receiptToken: data.receiptToken,
        approvalUrl: data.approvalUrl,
        providerOrderId: data.providerOrderId,
      }

      // The shopper may have switched method while this was in flight. The
      // order is theirs either way and the caller still gets it back, but it
      // must not paint bank details under a card form or become the thing
      // "Place order" acts on.
      if (getCheckoutState().paymentMethod !== next) return prepared

      // Recorded in both storages: the confirmation page uses it to recognise
      // the shopper who placed this order, and a payment taken on the
      // provider's own site can hand the browser back with a fresh session.
      rememberPlacedOrder(data.orderId, data.orderNumber)

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

      preparedRef.current = prepared
      return prepared
    } finally {
      setLoading(false)
    }
  }, [config])

  // What the order-creating route insists on before it will hand back an intent:
  // the details above filled in, and every compulsory tickbox on the review step
  // ticked. Choosing a method is never gated on any of it - only the network
  // call behind the choice is, and only until the shopper has finished.
  const outstandingRequirement = useCallback((state: CheckoutState): 'details' | 'agreements' | null => {
    if (!isContactAndShippingComplete(state, {
      businessNameRequired: config?.businessName?.required === true,
      phoneRequired: config?.requirePhone === true,
    })) return 'details'
    if (!areAgreementsAccepted(state.agreements, config?.checkoutAgreements ?? [])) return 'agreements'
    return null
  }, [config])

  function chooseMethod(next: string) {
    setMethod(next)
    setError(null)
    // Instructions belong to the method that was showing a moment ago - leaving
    // bank details on screen under a card form is its own small lie. The same
    // goes for anything a module said about the old method.
    setInstructions(null)
    setNotes([])
    preparedRef.current = null
    attemptedForRef.current = null
    pickedThisMountRef.current = true
    updateCheckoutState({ paymentMethod: next })
    // No prepareIntent call here on purpose: the effect below owns preparing, so
    // there is exactly one place that can create an order and no way for a click
    // and a state change to race into creating two.
  }

  // Prepares the chosen method the moment it can be prepared. A shopper who
  // picked one before finishing the form gets their card fields (or their bank
  // details) as soon as the last box is done, rather than a radio button that
  // tells them off for the order they did things in.
  useEffect(() => {
    function sync() {
      const state = getCheckoutState()
      // The choice is read from checkout state rather than from `method`:
      // updateCheckoutState fires this synchronously, well before React has
      // re-rendered with the new value, and preparing the method the shopper
      // has just moved off would create an order for the wrong one.
      const chosen = state.paymentMethod
      if (!config || !chosen || !pickedThisMountRef.current) return

      const outstanding = outstandingRequirement(state)
      setAwaiting(outstanding)
      // preparedRef is checked as well as the attempt marker because "Place
      // order" prepares by its own route: without this, a state change after
      // that would order the same thing twice.
      if (outstanding || preparingRef.current || attemptedForRef.current === chosen || preparedRef.current?.method === chosen) return

      attemptedForRef.current = chosen
      preparingRef.current = true
      prepareIntent(chosen)
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not start checkout'))
        .finally(() => {
          preparingRef.current = false
          // A method chosen while that call was in flight cleared the attempt
          // marker and found the door shut. Knock again.
          sync()
        })
    }

    sync()
    return subscribeCheckoutState(sync)
  }, [config, method, outstandingRequirement, prepareIntent])

  // What the chosen method means for this order, asked for the moment it is
  // chosen. The order-creating route hands back the same sentences, but it
  // cannot be called until the checkout is filled in and every compulsory box is
  // ticked - so a shopper weighing card against bank transfer used to be told
  // what bank transfer does to their delivery dates only after they had agreed
  // to the terms, which is some way past the point they were deciding. This
  // creates nothing; see the payment-note route.
  useEffect(() => {
    if (!method || !populated) return
    let cancelled = false

    function fetchNote() {
      const chosen = method
      if (!chosen) return
      fetch('/api/m/shop/public/checkout/payment-note', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: getCart(), paymentMethod: chosen }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          // A method switched during the round trip owns the panel now. And once
          // there is a real order for this method, its own notes are the ones
          // that count - they were computed from the lines as actually ordered.
          if (cancelled || !data || getCheckoutState().paymentMethod !== chosen) return
          if (preparedRef.current?.method === chosen) return
          setNotes(Array.isArray(data.notes) ? data.notes.filter((n: unknown): n is string => typeof n === 'string' && n.length > 0) : [])
        })
        // Silent: this is something extra the shopper is being told, and failing
        // to tell them must not put an error on a checkout that is working.
        .catch(() => {})
    }

    fetchNote()
    // The sentence quotes a figure off the basket (the longest lead time in it),
    // so a basket edited on the checkout page has to ask again.
    const unsubscribe = subscribeCart(fetchNote)
    return () => { cancelled = true; unsubscribe() }
  }, [method, populated])

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
        // The signed token, never the customer's email: a URL ends up in access
        // logs, browser history and the Referer sent to every third party this
        // page loads. See lib/order-receipt-token.
        window.location.href = `/shop/checkout/confirmation?orderNumber=${encodeURIComponent(prepared.orderNumber)}&t=${encodeURIComponent(prepared.receiptToken)}`
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
      <h2 style={{ fontSize: '1.125rem', margin: 0 }}>{heading || 'Payment method'}</h2>
      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {(config?.enabledPaymentMethods ?? []).map((m) => {
          const logo = config?.paymentMethodLogos?.[m]
          const description = config?.paymentMethodDescriptions?.[m]
          return (
            // Aligned to the top rather than the middle: with a second line
            // under the name, centring floats the radio button and the logo
            // into the gap between the two lines.
            <label key={m} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
              <input type="radio" name="paymentMethod" checked={method === m} onChange={() => chooseMethod(m)} disabled={loading} style={{ marginTop: '0.2rem' }} />
              {logo && <PaymentMethodLogo logo={logo} />}
              <span style={{ display: 'grid', gap: '0.125rem', minWidth: 0 }}>
                <span>{BUILT_IN_METHOD_LABELS[m] ?? config?.paymentMethodLabels?.[m] ?? m}</span>
                {description && (
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem', lineHeight: 1.35 }}>{description}</span>
                )}
              </span>
            </label>
          )
        })}
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
      {/* Says what is still owed and what it unlocks. It is a note, not a
          rebuke: the choice above has been kept, and nothing has gone wrong.
          Only the details are worth mentioning - the tickboxes sit right beside
          the button that is about to ask for them, and being told twice on one
          screen to tick a box you can already see reads as nagging. */}
      {method && awaiting === 'details' && (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', margin: 0 }}>
          Fill in your contact and delivery details above and this payment method will be set up for you.
        </p>
      )}
      {method === 'STRIPE' && (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {/* Mounted whether or not the card fields have been created yet: the
              Stripe Elements instance needs this node to already exist when it
              arrives, so it must not wait on a render of its own. */}
          <div ref={elementsRef} />
          {/* Reassurance sits with the card fields - the point of anxiety - not
              in a footer nobody reads. */}
          {!awaiting && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', margin: 0 }}>
              🔒 Card details go straight to the payment provider, encrypted - they never touch this site.
            </p>
          )}
        </div>
      )}
      {instructions && <p style={{ whiteSpace: 'pre-wrap', color: 'var(--color-text-muted)' }}>{instructions}</p>}
    </section>
  )
}
