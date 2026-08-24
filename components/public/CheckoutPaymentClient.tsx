'use client'

import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { getCart, subscribeCart } from '@/modules/shop/components/public/cart'
import {
  getCheckoutState, updateCheckoutState, isContactAndShippingComplete, areAgreementsAccepted, subscribeCheckoutState,
  rememberPlacedOrder,
  type CheckoutState,
} from '@/modules/shop/components/public/checkout-state'
import { formatUkPhone } from '@/modules/shop/lib/phone'
import { useCartPopulated } from '@/modules/shop/components/public/use-cart-populated'
import { HandoverDarkModeNotice, isDarkTheme } from '@/modules/shop/components/public/HandoverDarkModeNotice'
import type { ShpPaymentLogo } from '@/modules/shop/lib/payments/provider'
import type { ShopCheckoutPayer, ShopCheckoutPaymentFieldsProps } from '@/modules/shop/components/public/checkout-payment-fields'
import { payerFromState } from '@/modules/shop/components/public/checkout-payer'
import {
  CHECKOUT_PAYMENT_SLOT_EVENT, findCheckoutPaymentSlot,
} from '@/modules/shop/components/public/checkout-payment-slot'

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
  // The publishable, order-independent config a method's own on-page fields
  // draw from. Optional so a response from an older cached bundle still works.
  paymentMethodClientFields?: Record<string, Record<string, unknown>>
  stripePublishableKey: string | null
  currencySymbol: string
  // Optional so a response from an older cached bundle still works - the
  // fallback is the rule as it was before the business-name box existed.
  organisation?: { required?: boolean }
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
  // What this method's own on-page fields need in the browser, straight from
  // the provider's intent. Held on the prepared payment rather than in state of
  // its own so it can never outlive the attempt it belongs to.
  clientFields?: Record<string, unknown>
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
export function CheckoutPaymentClient({ preview = false, paymentFields, heading }: {
  preview?: boolean
  // Resolved server-side from the 'shop.checkout-payment-fields' extension
  // point (see lib/checkout-payment-fields.ts), keyed by payment method id -
  // empty when no module contributes on-page fields, and always empty in the
  // editor preview. This is how a card is typed HERE rather than on the
  // provider's own site; see the contract file for what the component gets.
  paymentFields?: Record<string, ComponentType<ShopCheckoutPaymentFieldsProps>>
  heading?: string
}) {
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
  // The provider's own site, once "Place order" has decided the shopper is
  // going there and the dark storefront has earned them a warning first. Only
  // the URL and the method are held; the provider's name is worked out at render
  // time, where the config with the owner's own labels in it is to hand.
  const [handover, setHandover] = useState<{ url: string; method: string } | null>(null)
  // Where the card fields are drawn: the review step's slot when there is one,
  // in place here when there is not. Looked up during the first render rather
  // than in an effect, because the slot is server-rendered and already in the
  // document by the time this island hydrates - resolving it a frame later
  // would draw the fields here and then move them, in front of the shopper.
  const [fieldsSlot, setFieldsSlot] = useState<HTMLElement | null>(findCheckoutPaymentSlot)
  // The per-order half of what a method's own fields draw from - whatever its
  // payment intent handed over (the amount to authorise, an id for this
  // attempt). In state because it arrives from a fetch rather than a render.
  //
  // Only half. The publishable, order-independent half comes off the public
  // config and is merged with this during render (see activeFieldsConfig), and
  // that split is the whole point: an intent needs a draft order, and the route
  // that drafts one refuses until the contact details are filled in AND every
  // compulsory tickbox is ticked. Fields fed only by the intent therefore
  // stayed invisible until the shopper had agreed to the terms - by which point
  // they had every reason to think the shop had forgotten to ask for a card.
  const [intentFields, setIntentFields] = useState<{ method: string; config: Record<string, unknown> } | null>(null)
  // Who is paying, kept in step with the steps above. Compared before it is
  // replaced so a keystroke in the contact box does not hand a module's card
  // fields a brand new object on every render.
  const [payer, setPayer] = useState<ShopCheckoutPayer>(() => payerFromState(getCheckoutState()))
  const elementsRef = useRef<HTMLDivElement>(null)
  // "Place order" handed to us by a module's own card fields. A ref rather than
  // state: it is called from an event handler, and a stale closure here would
  // submit the fields of a method the shopper has already moved off.
  const moduleSubmitRef = useRef<((config: Record<string, unknown>) => Promise<unknown>) | null>(null)
  const stripeInstanceRef = useRef<ReturnType<NonNullable<typeof window.Stripe>> | null>(null)
  const stripeElementsRef = useRef<unknown>(null)
  const preparedRef = useRef<PreparedPayment | null>(null)
  const preparingRef = useRef(false)
  // Whether a "Place order" is already running. The Review block disables its
  // button while placing, but it re-enables on failure - which is right, a
  // declined card should be retryable - and that leaves a window where a second
  // press can land on top of the first. This closes it at the only place that
  // matters: the path that tokenises a card and asks the server to charge it.
  const placingRef = useRef(false)
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

  useEffect(() => {
    function sync() {
      setPayer((prev) => {
        const next = payerFromState(getCheckoutState())
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next
      })
    }
    sync()
    return subscribeCheckoutState(sync)
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
          customerOrganisation: state.customerOrganisation.trim() || undefined,
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
        clientFields: data.clientFields && typeof data.clientFields === 'object' ? data.clientFields : undefined,
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
      } else if (prepared.clientFields && paymentFields?.[next]) {
        // A module's own fields. Nothing is mounted here - handing the config
        // over is enough, and the component below does its own loading when it
        // renders. Which keeps a payment SDK off the page of a shopper who
        // picked bank transfer.
        //
        // Kept apart from the publishable half rather than folded into it: the
        // fields are very likely already on screen by now, and the two are
        // merged during render, so nothing here can tear down a half-typed card.
        setIntentFields({ method: next, config: { ...prepared.clientFields } })
      } else if (data.instructions) {
        setInstructions(data.instructions)
      }

      preparedRef.current = prepared
      return prepared
    } finally {
      setLoading(false)
    }
  }, [config, paymentFields])

  // What the order-creating route insists on before it will hand back an intent:
  // the details above filled in, and every compulsory tickbox on the review step
  // ticked. Choosing a method is never gated on any of it - only the network
  // call behind the choice is, and only until the shopper has finished.
  const outstandingRequirement = useCallback((state: CheckoutState): 'details' | 'agreements' | null => {
    if (!isContactAndShippingComplete(state, {
      organisationRequired: config?.organisation?.required === true,
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
    // Card fields belonging to the method that was showing a moment ago have to
    // go with it: leaving them up would let "Place order" submit a card to a
    // provider the shopper is no longer paying with.
    setIntentFields(null)
    moduleSubmitRef.current = null
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

  // What the chosen method's own fields draw from, worked out during render
  // rather than held in state: the publishable half is a plain function of the
  // method and the config already in hand, and computing it here is what lets
  // the fields appear the instant the method is picked with nothing to wait for.
  //
  // The intent's half is merged over the top, so the amount to authorise turns
  // up in the fields the moment there is an order to have one. A fresh object
  // each render is harmless - the fields key their own mounting on the values
  // inside it, not on its identity.
  const staticFields = method ? config?.paymentMethodClientFields?.[method] : undefined
  const perOrderFields = method && intentFields?.method === method ? intentFields.config : undefined
  const activeFieldsConfig =
    staticFields || perOrderFields ? { ...(staticFields ?? {}), ...(perOrderFields ?? {}) } : null

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
    async function placeOrder(event: Event) {
      // A wallet button above "Place order" has already opened its sheet, had
      // the shopper approve it, and tokenised - all of it inside the click, as
      // Apple Pay insists. What arrives here is that token, and it stands in
      // for whatever the method's on-page fields would have produced.
      const walletPayload = (event as CustomEvent<{ paymentPayload?: unknown } | undefined>).detail?.paymentPayload

      if (!method) {
        window.dispatchEvent(new CustomEvent('cactus-shop-order-error', { detail: 'Please choose a payment method first.' }))
        return
      }
      // Silently, and deliberately so: the first press is still working and the
      // button already says so. An error here would be a lie about a payment
      // that has not failed, and - worse - the Review block treats an error as
      // "that press is over" and re-enables its button, which is precisely the
      // door this is shutting.
      if (placingRef.current) return
      placingRef.current = true

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
          // A method whose fields were only created by the prepare above has
          // not had them on screen for so much as a frame, and this branch would
          // walk the shopper straight past the very thing they were meant to
          // fill in. It is the same guard the card branches below already carry,
          // and it matters most to the shopper who changed nothing: a method
          // restored from a previous visit is never prepared on mount (see
          // pickedThisMountRef), so without this their first press of "Place
          // order" was always a silent handover.
          //
          // The second press goes through either way. A handover method's own
          // fields are a shortcut - choosing a bank here rather than on the
          // provider's page - never a requirement, so nothing here may become
          // one.
          if (freshlyPrepared && prepared.clientFields && paymentFields?.[method]) {
            throw new Error('Please finish the payment details above, then place your order.')
          }
          if (method === 'PAYPAL') sessionStorage.setItem('cactus_shop_paypal_order_id', prepared.providerOrderId ?? '')
          // A shopper on the dark storefront gets a word of warning first: the
          // provider draws its own site in its own colours, and being handed a
          // white screen at the moment you approve a payment is a shock nobody
          // needs. The notice hands them over by itself if they leave it alone,
          // so this is a pause rather than a stop.
          if (isDarkTheme()) { setHandover({ url: prepared.approvalUrl, method }); return }
          window.location.href = prepared.approvalUrl
          return
        }

        let payload: unknown = {}
        if (walletPayload !== undefined) {
          // Straight through. The card fields are not asked for anything - they
          // may not even be on the page - and nothing here reads the token: the
          // confirm route hands it to the provider, which re-checks the amount
          // and the currency against the order the prepare above just created.
          payload = walletPayload
        } else if (method === 'STRIPE') {
          // A card form that was only just mounted is necessarily empty, so ask
          // rather than submit a blank card and relay Stripe's error for it.
          if (freshlyPrepared) throw new Error('Please enter your card details, then place your order.')
          const stripe = stripeInstanceRef.current
          if (!stripe || !stripeElementsRef.current) throw new Error('Payment form not ready')
          const result = await stripe.confirmPayment({ elements: stripeElementsRef.current, confirmParams: { return_url: window.location.href }, redirect: 'if_required' })
          if (result.error) throw new Error(result.error.message)
          payload = { paymentIntentId: result.paymentIntent?.id }
        } else if (prepared.clientFields && paymentFields?.[method]) {
          // A module's own payment fields, filled in on this page.
          //
          // Deliberately NOT gated on freshlyPrepared, unlike the Stripe branch
          // above. Stripe's fields are built BY the prepare call, so on the
          // press that created them they are necessarily empty. A module's are
          // drawn when the method is picked (see the effect that reads
          // paymentMethodClientFields) and have been sitting there ever since -
          // so a shopper who typed their card before ticking the terms box has
          // genuinely filled them in, and sending them round again for a second
          // press would be the same discourtesy in a new place. Fields that ARE
          // empty say so themselves, in their own wording.
          //
          // No submit registered is not a failure. A module whose fields only
          // record a choice (which bank, say) has nothing to hand over at this
          // point and says so by never registering one - see the contract file.
          //
          // What does come back is whatever the component decided to hand over:
          // a one-time card token, typically. It goes straight through to the
          // confirm route, which gives it to the provider's own confirmPayment.
          // Nothing here reads it, and nothing here treats it as proof of
          // anything - the server still asks the provider whether money moved.
          //
          // The config is handed over at CALL time, freshly merged from the
          // intent that resolved a few lines above. The registered function is
          // whatever the component last registered, which - since nothing has
          // waited for React to re-render since the intent arrived - is very
          // often the one from before there was an amount to authorise. Left to
          // its own closure it asks the provider to verify a payment of
          // nothing, and the shopper is told their arguments are invalid.
          const submit = moduleSubmitRef.current
          if (submit) {
            payload = await submit({
              ...(config?.paymentMethodClientFields?.[method] ?? {}),
              ...prepared.clientFields,
            })
          }
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
      } finally {
        // Released on the way out, including the success path: that path
        // navigates to the confirmation page, so the flag going false a moment
        // before the browser leaves changes nothing. A failure genuinely is
        // over, and the shopper must be able to try again with another card.
        placingRef.current = false
      }
    }

    window.addEventListener('cactus-shop-place-order', placeOrder)
    return () => window.removeEventListener('cactus-shop-place-order', placeOrder)
  }, [config, method, paymentFields, prepareIntent])

  // The review step says when its slot appears or disappears. An empty basket
  // takes the whole step off the page, and a layout may have no review step at
  // all - both land the fields back here, which is where they were before any
  // of this and is a perfectly good place for them.
  useEffect(() => {
    function sync() { setFieldsSlot(findCheckoutPaymentSlot()) }
    sync()
    window.addEventListener(CHECKOUT_PAYMENT_SLOT_EVENT, sync)
    return () => window.removeEventListener(CHECKOUT_PAYMENT_SLOT_EVENT, sync)
  }, [])

  // The card fields, whoever's they are. Built here and drawn wherever the
  // portal below puts them - see checkout-payment-slot.ts. Everything that
  // makes them work stays in this block: the intent that feeds them, the
  // submit handle "Place order" calls, and the withdrawal of that handle the
  // moment the shopper switches method.
  //
  // null when there is nothing to draw, so neither home is left with an empty
  // box opening a gap in a grid that has spacing of its own.
  const moduleFieldsComponent = method && activeFieldsConfig ? paymentFields?.[method] : undefined
  const cardFields: ReactNode = (method !== 'STRIPE' && !moduleFieldsComponent) ? null : (
    // Keeps its own spacing, because it is drawn in two different grids.
    <div style={{ display: 'grid', gap: '0.75rem' }}>
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
      {/* A module's own card fields, drawn where Stripe's would be. Rendered
          only for the chosen method and only once its intent has arrived with
          something for them to work with, so a shop with two card providers
          installed still loads exactly one SDK - the one being paid with. */}
      {(() => {
        const Fields = moduleFieldsComponent
        if (!Fields || !activeFieldsConfig) return null
        // Deliberately no reassurance line of shop's own underneath. The Stripe
        // block above can promise the card goes straight to the provider
        // because shop knows those fields are a card; these it does not. The
        // same sentence under a list of banks would be talking about a card
        // nobody is being asked for. A provider that collects card details says
        // so from inside its own component, where the claim is true.
        return (
          <Fields
            config={activeFieldsConfig}
            payer={payer}
            onError={setError}
            registerSubmit={(submit) => { moduleSubmitRef.current = submit }}
          />
        )
      })()}
    </div>
  )

  // Empty basket: nothing to pay for. Rendering payment methods here invites a
  // click that can only end in an error from the payment-intent route.
  if (!populated) return null

  return (
    // The top margin is the gap to the step above: these are separate blocks in
    // one Puck zone, so nothing else puts air between the checkout steps.
    <section style={{ display: 'grid', gap: '0.75rem', maxWidth: 480, marginTop: '2rem' }}>
      <h2 style={{ fontSize: '1.125rem', margin: 0 }}>{heading || 'Payment method'}</h2>
      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {(config?.enabledPaymentMethods ?? []).map((m, i) => {
          const logo = config?.paymentMethodLogos?.[m]
          const description = config?.paymentMethodDescriptions?.[m]
          return (
            // Aligned to the top rather than the middle: with a second line
            // under the name, centring floats the radio button and the logo
            // into the gap between the two lines.
            <label key={m} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
              {/* The review step's "still to do" line links here, the same way it
                  links to the boxes on the steps above. Only the first radio is
                  marked: the ask is "pick one", not "pick this one". */}
              <input type="radio" name="paymentMethod" data-shop-field={i === 0 ? 'paymentMethod' : undefined} checked={method === m} onChange={() => chooseMethod(m)} disabled={loading} style={{ marginTop: '0.2rem' }} />
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
      {/* Drawn in the review step, beside the button that pays - or here, when
          a layout has no review step to lend a slot. Either way these are this
          block's own React tree, so nothing remounts and nothing the shopper
          has typed is lost when the slot comes or goes. */}
      {cardFields && (fieldsSlot ? createPortal(cardFields, fieldsSlot) : cardFields)}
      {instructions && <p style={{ whiteSpace: 'pre-wrap', color: 'var(--color-text-muted)' }}>{instructions}</p>}
      {/* Named the same way the radio button above it is named, so the shopper
          is told they are off to the thing they actually picked. */}
      {handover && (
        <HandoverDarkModeNotice
          providerName={BUILT_IN_METHOD_LABELS[handover.method] ?? config?.paymentMethodLabels?.[handover.method] ?? handover.method}
          onContinue={() => { window.location.href = handover.url }}
        />
      )}
    </section>
  )
}
