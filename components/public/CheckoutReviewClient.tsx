'use client'

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { getCart } from '@/modules/shop/components/public/cart'
import {
  getCheckoutState, subscribeCheckoutState, updateCheckoutState, areAgreementsAccepted,
  missingCheckoutFields, focusCheckoutField, checkoutBlockedSegments, type MissingCheckoutField,
} from '@/modules/shop/components/public/checkout-state'
import { useCartPopulated } from '@/modules/shop/components/public/use-cart-populated'
import { payerFromState } from '@/modules/shop/components/public/checkout-payer'
import type { ShopCheckoutWalletButtonsProps } from '@/modules/shop/components/public/checkout-wallet-buttons'
import {
  CHECKOUT_PAYMENT_SLOT_ID, announceCheckoutPaymentSlot,
} from '@/modules/shop/components/public/checkout-payment-slot'
import { fetchShopPublicConfig } from '@/modules/shop/lib/public-config-client'
import { publishCheckoutTotal } from '@/modules/shop/components/public/checkout-total-bus'

type SessionSummary = {
  subtotal: number; discountAmount: number; shippingAmount: number; taxAmount: number; total: number
  currencySymbol: string; hasPreOrderItems: boolean
  // The same display-only split the basket shows: the goods on their own, and a
  // row per named charge a module priced into the lines (a delivery service).
  // Both optional so a response from an older cached bundle still renders - the
  // fallback is the old single Subtotal row.
  goodsSubtotal?: number
  charges?: { label: string; amount: number }[]
  // Whether prices already include tax, so the tax row can say which it is
  // rather than sitting in a column that does not add up.
  taxMode?: 'INCLUSIVE' | 'EXCLUSIVE'
  // Mirrors the shop's preOrderMixedCartBehaviour setting, returned by the
  // checkout session route. Optional so a response from an older cached bundle
  // still renders; the fallback matches the setting's own default.
  preOrderMixedCartBehaviour?: 'HOLD_ALL' | 'PROMPT_SPLIT'
}

// Both values are fulfilment policies, so this notice is the only place the
// setting reaches the shopper. It tells them what will actually happen to their
// parcel - it never gates the Place order button, because a mixed basket is
// always purchasable.
const PRE_ORDER_NOTICE: Record<'HOLD_ALL' | 'PROMPT_SPLIT', string> = {
  HOLD_ALL: 'This order contains a pre-order item, so the whole order is sent together once everything has arrived.',
  PROMPT_SPLIT: 'This order contains a pre-order item. Anything in stock can be sent straight away, with the pre-order to follow.',
}

// The turning ring beside "Placing order…", and nothing else - everything else
// on this block is inline-styled, and an animation cannot be. Injected with the
// block rather than written into core's globals.css, same discipline as
// order-confirmation-css.ts: a module styles its own furniture.
//
// `currentColor` throughout, so the ring is whatever the button's text is in
// either theme and no hex has to guess. Anyone who has asked not to be moved
// about gets a slow turn rather than a still ring: the point of it is that
// something is still happening, and a frozen spinner says the opposite.
const PLACE_ORDER_SPINNER_CSS = `
.scr-spinner{width:1em;height:1em;border-radius:var(--radius-full,9999px);
  border:2px solid currentColor;border-top-color:transparent;
  animation:scr-spin 0.7s linear infinite;flex:0 0 auto}
@keyframes scr-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.scr-spinner{animation-duration:2.4s}}
`

// A checkout tickbox as the shop has resolved it (see resolveCheckoutAgreements).
type Agreement = { id: string; statement: string; linkUrl: string; required: boolean }

// A statement may carry one bracketed run - "I agree to the [terms]" - which
// becomes the link. No brackets and a link still set puts the link at the end,
// so a statement written before anyone thought about links keeps its link
// rather than losing it silently. Returns plain text when there is no URL.
function renderStatement(agreement: Agreement) {
  const { statement, linkUrl } = agreement
  if (!linkUrl) return statement.replace(/\[([^\]]*)\]/g, '$1')

  const match = statement.match(/^(.*?)\[([^\]]*)\](.*)$/s)
  const link = (text: string) => (
    // Opened away from the checkout deliberately: reading the terms must never
    // cost a shopper the basket and the form they have just filled in.
    <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>{text}</a>
  )
  if (!match) return <>{statement} {link('Read them')}</>
  return <>{match[1]}{link(match[2] ?? '')}{match[3]}</>
}

// Where the payment step draws its card fields (see checkout-payment-slot.ts).
// `display: contents` on purpose: the fields become items of this step's own
// grid, so they are spaced like everything else here and an empty slot - no
// method chosen yet, or a method with nothing to fill in - takes up no room
// rather than opening a gap above the button.
//
// A component of its own so the announcement is tied to the element's real
// lifetime: this step disappears entirely when the basket is emptied, and the
// payment step has to be told to take its fields back.
function CheckoutPaymentFieldsSlot() {
  useEffect(() => {
    announceCheckoutPaymentSlot()
    return () => {
      // After this render has been committed, so the payment step looks for the
      // slot when it has actually gone rather than while it is still there.
      queueMicrotask(announceCheckoutPaymentSlot)
    }
  }, [])
  return <div id={CHECKOUT_PAYMENT_SLOT_ID} style={{ display: 'contents' }} />
}

// Client island for the checkout review step (order summary + place order).
// Registered Puck block wrapper (ShopCheckoutReview) is a server component that
// renders this, so Puck's RSC <Render> never serialises its renderDropZone
// function bag into the client.
export function CheckoutReviewClient({ preview = false, heading, buttonLabel, trustText, walletButtons }: {
  preview?: boolean
  heading?: string
  buttonLabel?: string
  trustText?: string
  // Resolved server-side from the 'shop.checkout-wallet-buttons' extension
  // point (see lib/checkout-wallet-buttons.ts), keyed by payment method id -
  // so the Apple Pay / Google Pay buttons a payment module contributes are
  // drawn only when that module's method is the one chosen. Absent on the
  // editor path, which has no shopper and no basket to pay for.
  walletButtons?: Record<string, ComponentType<ShopCheckoutWalletButtonsProps>>
}) {
  const populated = useCartPopulated(preview)
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The payment step may only offer certain methods on an order of a certain
  // size, and this is the block that knows what the order comes to. Published
  // rather than handed over: the two are separate Puck blocks with no state
  // between them. Cleared on the way out, so a total does not outlive the
  // summary that produced it. See checkout-total-bus.ts.
  useEffect(() => {
    publishCheckoutTotal(summary ? summary.total : null)
  }, [summary])
  useEffect(() => () => publishCheckoutTotal(null), [])
  // Which compulsory boxes above are still outstanding, named as their own
  // labels name them. The shopper reads this instead of being left to hunt for
  // whichever field is holding the button shut. It gates the button; it no
  // longer hides the total, which is the one thing a shopper came here for.
  const [missing, setMissing] = useState<MissingCheckoutField[]>([])
  // Whether carriage is still unpriced - no postcode, or no service chosen -
  // so the figures on screen are the goods and nothing else.
  const [awaitingDelivery, setAwaitingDelivery] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [organisationRequired, setOrganisationRequired] = useState(false)
  const [organisationLabel, setOrganisationLabel] = useState('')
  const [referenceRequired, setReferenceRequired] = useState(false)
  const [referenceLabel, setReferenceLabel] = useState('')
  const [phoneRequired, setPhoneRequired] = useState(false)
  // The shop's ISO currency code, and the publishable per-method config a
  // payment module's own components draw from. Both come off the same config
  // read as everything else here, and both are only of interest to the wallet
  // buttons: a wallet sheet has to quote a currency, and Square's SDK needs its
  // Application ID before anybody has pressed anything.
  const [currency, setCurrency] = useState('GBP')
  const [methodClientFields, setMethodClientFields] = useState<Record<string, Record<string, unknown>>>({})
  // Which boxes are ticked, mirrored out of checkout state so this block
  // re-renders on a tick. checkout-state stays the source of truth, because the
  // payment block reads it from there when it posts the order.
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  // Mirrored out of checkout state for the same reason as the tickboxes: the
  // radio buttons live in the payment block, and this block has to know whether
  // one has been picked before it will let the order be placed.
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null)
  // The last query the totals were worked out from, and a ticket per request,
  // so a form being typed into does not fire a request per character or apply
  // its answers out of order.
  const lastQueryRef = useRef<string | null>(null)
  const requestRef = useRef(0)
  // The same flag as `placing`, kept where it can be read in the click itself.
  // `disabled` on the button only shuts the door on the render AFTER the state
  // change, and a second press - a double tap, a wallet button of its own, a
  // browser firing touch and click for one finger - can land inside that gap.
  // Every press it lets through starts a fresh order at the payment step, which
  // is how one shopper ends up in the orders list three times.
  const placingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    fetchShopPublicConfig<{
      checkoutAgreements?: Agreement[]
      organisation?: { required?: boolean; label?: string }
      customerReference?: { required?: boolean; label?: string }
      requirePhone?: boolean
      currency?: string
      paymentMethodClientFields?: Record<string, Record<string, unknown>>
    }>()
      .then((d) => {
        if (cancelled || !d) return
        setAgreements(d.checkoutAgreements ?? [])
        // Both optional so a response from an older cached bundle still renders
        // - a checkout with no wallet buttons on it is what every shop had
        // until now, and sterling is what the shop defaults to anyway.
        if (d.currency) setCurrency(d.currency)
        setMethodClientFields(d.paymentMethodClientFields ?? {})
        setOrganisationRequired(d.organisation?.required === true)
        // The owner's own wording for that box, so the outstanding list calls it
        // what the form above calls it rather than inventing a name for it.
        setOrganisationLabel(d.organisation?.label ?? '')
        setReferenceRequired(d.customerReference?.required === true)
        setReferenceLabel(d.customerReference?.label ?? '')
        setPhoneRequired(d.requirePhone === true)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    function loadSummary() {
      const state = getCheckoutState()
      const lines = getCart()
      setTicked(state.agreements ?? {})
      setPaymentMethod(state.paymentMethod)
      setMissing(missingCheckoutFields(state, { organisationRequired, organisationLabel, customerReferenceRequired: referenceRequired, customerReferenceLabel: referenceLabel, phoneRequired }))
      if (lines.length === 0) { setSummary(null); return }

      // Carriage is only priced once there is a postcode and a service picked,
      // so an early total is the goods on their own. Said out loud below rather
      // than left to read like free delivery.
      setAwaitingDelivery(state.shippingAddress.postcode.trim().length === 0 || !state.shippingRateId)

      const query = JSON.stringify({
        lines,
        postcode: state.shippingAddress.postcode,
        shippingRateId: state.shippingRateId,
        couponCode: state.couponCode,
        // The route validates this as an email address, so a half-typed one
        // would 400 the total off the screen mid-keystroke. It only bears on
        // per-customer coupon limits, so null until it is one costs nothing.
        customerEmail: /\S+@\S+\.\S+/.test(state.customerEmail) ? state.customerEmail : null,
      })
      // Every keystroke in the boxes above republishes checkout state, and most
      // of them change nothing the total is worked out from. Only a query that
      // has actually changed is worth a request, and even then not until the
      // typing stops.
      if (query === lastQueryRef.current) return
      const first = lastQueryRef.current === null
      lastQueryRef.current = query

      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const ticket = ++requestRef.current
        fetch('/api/m/shop/public/checkout/session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: query,
        }).then(async (res) => {
          const data = await res.json()
          // A slow earlier answer must never land on top of a later one.
          if (ticket !== requestRef.current) return
          if (res.ok) { setSummary(data); setError(null) }
          else {
            setSummary(null)
            setError(data.error ?? 'Could not load order summary')
            // Let the same query be asked again once something else changes -
            // a refused total is not an answer worth caching.
            lastQueryRef.current = null
          }
        }).catch(() => {})
      }, first ? 0 : 350)
    }

    loadSummary()
    const unsubscribe = subscribeCheckoutState(loadSummary)

    // An attempt that failed genuinely is over: the shopper has to be able to
    // try again with another card. The ref is released with the state it
    // mirrors, never separately - a button that says "Place order" while the
    // guard is still shut would take a press and do nothing with it.
    function onError(e: Event) { placingRef.current = false; setPlacing(false); setError((e as CustomEvent).detail) }
    window.addEventListener('cactus-shop-order-error', onError)
    return () => {
      unsubscribe()
      window.removeEventListener('cactus-shop-order-error', onError)
      if (timer) clearTimeout(timer)
    }
    // Re-runs when the business-name and phone rules arrive from config: the
    // completeness test above closes over them, so a stale `false` would wave
    // through a checkout the order route is about to refuse.
  }, [organisationRequired, organisationLabel, referenceRequired, referenceLabel, phoneRequired])

  function setAgreement(id: string, accepted: boolean) {
    const next = { ...getCheckoutState().agreements, [id]: accepted }
    setTicked(next)
    updateCheckoutState({ agreements: next })
  }

  // What is still outstanding ON THIS BLOCK - the decisions that live here
  // rather than in the boxes further up the page. Kept as parts rather than a
  // sentence because they end up in the same sentence as the outstanding boxes,
  // each one linked to the thing it is asking for.
  function outstandingDecisions(): { key: string; text: string }[] {
    const parts: { key: string; text: string }[] = []
    if (!paymentMethod) parts.push({ key: 'paymentMethod', text: 'choose a payment method above' })
    if (!areAgreementsAccepted(ticked, agreements)) {
      parts.push({
        key: 'agreements',
        text: `tick the box${agreements.filter((a) => a.required).length === 1 ? '' : 'es'} marked *`,
      })
    }
    return parts
  }

  // `paymentPayload` is how a wallet button places the order: Apple Pay and
  // Google Pay approve the payment BEFORE anything is placed (their sheets open
  // inside the click, and hand back a one-time token there and then), so the
  // token travels with the event rather than being asked for afterwards. A
  // press of the button itself passes nothing and the payment block asks the
  // chosen method's own fields, exactly as it always has.
  function placeOrder(paymentPayload?: unknown) {
    // The button is disabled while anything is outstanding, so this is a guard
    // rather than a code path - it exists so a stale render can never post. It
    // guards the wallet buttons too, which are disabled by the same test: a
    // shopper must not skip the terms tickbox by paying with their watch.
    if (outstandingDecisions().length > 0 || missingCheckoutFields(getCheckoutState(), { organisationRequired, organisationLabel, customerReferenceRequired: referenceRequired, customerReferenceLabel: referenceLabel, phoneRequired }).length > 0) return
    // Silently, and before anything else: the press that is already running has
    // the button saying so, and a second one has nothing to add. Read from the
    // ref rather than the `placing` state because this runs inside the click,
    // where the state is still whatever the last render saw.
    if (placingRef.current) return
    placingRef.current = true
    setPlacing(true)
    setError(null)
    window.dispatchEvent(new CustomEvent('cactus-shop-place-order', {
      detail: paymentPayload === undefined ? undefined : { paymentPayload },
    }))
  }

  // Empty basket: no order to review, no total to show, nothing to place - the
  // order-summary block carries the empty message.
  if (!populated) return null

  // Everything holding the button shut, in one red line, with each outstanding
  // bit linked to the box or choice that owns it. The wording is worked out in
  // checkout-state, next to the list of what is missing - this only draws it.
  const segments = checkoutBlockedSegments(missing, outstandingDecisions())
  const notice = segments.length === 0 ? null : (
    <p
      id="shop-place-order-blocked"
      role="status"
      // Theme-aware token, so the same line clears AA on the light storefront
      // and the dark one. A hex here would only ever be right in one of them.
      style={{ color: 'var(--color-danger)', margin: 0, fontSize: '0.875rem', lineHeight: 1.5 }}
    >
      {segments.map((segment, i) => (segment.fieldKey
        // A button rather than an anchor: there is nowhere to link to, only a
        // box further up to scroll to and focus. Colour is inherited so it
        // reads as part of the red line, underlined so it still reads as
        // something to press.
        ? (
          <button
            key={i}
            type="button"
            onClick={() => focusCheckoutField(segment.fieldKey!)}
            style={{
              background: 'none', border: 0, padding: 0, font: 'inherit',
              color: 'inherit', textDecoration: 'underline', cursor: 'pointer',
            }}
          >
            {segment.text}
          </button>
        )
        : <span key={i}>{segment.text}</span>
      ))}
    </p>
  )

  const firstRequiredAgreementId = agreements.find((a) => a.required)?.id

  // No total yet: the first request is still out, or the shop refused to price
  // this basket (a minimum order, a line that has just sold out). Either way the
  // outstanding line still belongs on screen.
  if (!summary) {
    return (
      // The top margin is the gap to the step above: these are separate blocks
      // in one Puck zone, so nothing else puts air between the checkout steps.
      <section style={{ display: 'grid', gap: '0.75rem', maxWidth: 480, marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', margin: 0 }}>{heading || 'Order review'}</h2>
        {error
          ? <p style={{ color: 'var(--color-danger)', margin: 0 }}>{error}</p>
          : <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>Working out your order total…</p>}
        {notice}
        {/* Deliberately NO card-field slot in this branch. It is on screen only
            while the first total is being worked out, which is long before
            anybody has picked a payment method, so it would gain nothing - and
            a second slot in a different place in the tree means React tears the
            fields down and builds them again when this branch swaps for the one
            below, taking a half-typed card number with it. */}
      </section>
    )
  }


  const money = (n: number) => `${summary.currencySymbol}${n.toFixed(2)}`
  // Both halves hold the button shut: the boxes above, and the decisions on this
  // block. Neither hides the total any more, and both are said in the one line.
  const blocked = notice !== null
  // The chosen method's own wallet buttons, if the module that provides that
  // method contributed any. Nothing is drawn until a method is picked, because
  // a wallet button belongs to one payment provider and paying by Apple Pay
  // through a shop that has bank transfer selected means nothing.
  const WalletButtons = paymentMethod ? walletButtons?.[paymentMethod] : undefined

  return (
    // Same top margin as the incomplete state above, so the step does not jump
    // up the page the moment the total can be worked out.
    <section style={{ display: 'grid', gap: '0.75rem', maxWidth: 480, marginTop: '2rem' }}>
      <h2 style={{ fontSize: '1.125rem', margin: 0 }}>{heading || 'Order review'}</h2>
      {summary.hasPreOrderItems && (
        <p style={{ background: 'var(--color-bg-subtle)', borderRadius: 6, padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>
          {PRE_ORDER_NOTICE[summary.preOrderMixedCartBehaviour ?? 'HOLD_ALL']}
        </p>
      )}
      <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.25rem 1rem', margin: 0 }}>
        {/* Goods on their own where the server broke the charges out, else the
            old single Subtotal - which is the same figure, just undivided. */}
        <dt>Subtotal</dt>
        <dd style={{ margin: 0 }}>{money(summary.goodsSubtotal ?? summary.subtotal)}</dd>
        {(summary.charges ?? []).map((charge) => (
          <div key={charge.label} style={{ display: 'contents' }}>
            <dt>{charge.label}</dt><dd style={{ margin: 0 }}>{money(charge.amount)}</dd>
          </div>
        ))}
        {summary.discountAmount > 0 && <><dt>Discount</dt><dd style={{ margin: 0 }}>-{money(summary.discountAmount)}</dd></>}
        {/* Carriage priced from the delivery postcode - a different thing from a
            per-item delivery service, and worth its own row only when charged. */}
        {summary.shippingAmount > 0 && <><dt>Shipping</dt><dd style={{ margin: 0 }}>{money(summary.shippingAmount)}</dd></>}
        {summary.taxAmount > 0 && (
          <>
            <dt>VAT{summary.taxMode === 'INCLUSIVE' ? ' (included)' : ''}</dt>
            <dd style={{ margin: 0 }}>{money(summary.taxAmount)}</dd>
          </>
        )}
        <dt style={{ fontWeight: 600 }}>Total</dt><dd style={{ margin: 0, fontWeight: 600 }}>{money(summary.total)}</dd>
      </dl>
      {/* Said before the shopper works it out for themselves: a total with no
          postcode behind it is the goods, and delivery lands on it later. */}
      {awaitingDelivery && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', margin: 0 }}>
          Delivery is added to this once your postcode and delivery choice are in above.
        </p>
      )}
      {/* The shop owner's tickboxes, immediately above the button they gate.
          Anywhere further up the page and a shopper hits a button that refuses
          to work for a reason that has scrolled off the screen. */}
      {agreements.length > 0 && (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {agreements.map((agreement) => (
            <label
              key={agreement.id}
              style={{
                display: 'flex', gap: '0.625rem', alignItems: 'start', cursor: 'pointer', lineHeight: 1.45,
                border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.625rem 0.75rem',
              }}
            >
              {/* The line above links "tick the boxes marked *" to the first
                  compulsory box, the same way it links to the boxes on the
                  steps above. */}
              <input
                type="checkbox"
                data-shop-field={agreement.id === firstRequiredAgreementId ? 'agreements' : undefined}
                checked={ticked[agreement.id] === true}
                onChange={(e) => setAgreement(agreement.id, e.target.checked)}
                required={agreement.required}
                style={{ marginTop: '0.1875rem', flex: '0 0 auto' }}
              />
              <span>
                {renderStatement(agreement)}
                {agreement.required && <span aria-hidden="true" style={{ color: 'var(--color-danger)' }}> *</span>}
              </span>
            </label>
          ))}
        </div>
      )}
      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
      {/* Sits above the button rather than below it, and appears before the
          click rather than after: what is left to do should be readable in the
          same glance as the button it is holding shut. */}
      {notice}
      {/* Order from here down is the order the shopper thinks in: what is still
          missing, then the quick ways to pay, then the card, then the button.
          The outstanding line comes FIRST on purpose - it explains why the
          wallet buttons below it are greyed out, and an explanation underneath
          the thing it explains is no explanation at all. */}
      {/* Wallet buttons are enabled by exactly the test that enables "Place
          order", so the shopper who can pay with a thumbprint still cannot skip
          the address or the tickboxes. The module draws whatever the device can
          actually offer - often only one of the two - and draws nothing at all
          where neither is available. */}
      {WalletButtons && paymentMethod && (
        <WalletButtons
          config={methodClientFields[paymentMethod] ?? {}}
          // Read at click time, not now: the address above is still being typed
          // into, and a wallet only wants a billing contact at the moment it is
          // pressed. See the contract file.
          getPayer={() => payerFromState(getCheckoutState())}
          amount={summary.total}
          currency={currency}
          disabled={placing || blocked}
          onError={setError}
          placeOrder={placeOrder}
        />
      )}
      {/* The chosen method's card fields, drawn by the payment step through a
          portal (see checkout-payment-slot.ts). They belong beside the button
          that pays: three blocks up the page they were filled in before the
          shopper had seen the total, and skipped entirely by anyone who
          scrolled straight to the button. */}
      <CheckoutPaymentFieldsSlot />
      <style dangerouslySetInnerHTML={{ __html: PLACE_ORDER_SPINNER_CSS }} />
      <button
        type="button"
        onClick={() => placeOrder()}
        disabled={placing || blocked}
        // Says the press was taken even to a shopper who cannot see the ring
        // turning, and stops a screen reader announcing the changed label as a
        // button that is ready for another go.
        aria-busy={placing || undefined}
        aria-describedby={notice ? 'shop-place-order-blocked' : undefined}
        style={{
          // The spinner sits beside the words rather than in front of them, and
          // the whole lot stays centred as the label changes length.
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          background: blocked ? 'var(--color-bg-subtle)' : 'var(--color-primary)',
          // Secondary rather than muted: a disabled control still has to be
          // readable, and muted-on-subtle misses AA in both themes.
          color: blocked ? 'var(--color-text-secondary)' : 'var(--color-on-primary)',
          // Transparent rather than none, so the button does not change size
          // when it becomes placeable.
          border: `1px solid ${blocked ? 'var(--color-border)' : 'transparent'}`,
          borderRadius: 8, padding: '0.75rem 1.25rem', fontWeight: 600,
          // Three states, three cursors: shut because something is outstanding,
          // working, and ready. A payment being taken is a wait, not a refusal.
          cursor: placing ? 'progress' : blocked ? 'not-allowed' : 'pointer',
        }}
      >
        {/* The button states exactly what happens, amount included - no
            surprises on the far side of a click. Once pressed it says so and
            keeps saying so: the confirm can be several seconds of a provider
            talking to a bank, and a button that just sits there looking pressable
            is exactly what gets pressed again. */}
        {placing
          ? (<><span className="scr-spinner" aria-hidden="true" />Placing order…</>)
          : `${buttonLabel || 'Place order'} - ${money(summary.total)}`}
      </button>
      {/* Nothing unless the owner writes something. The block used to supply a
          padlock-and-reassurance line of its own, which said something about
          card handling on a checkout that might be taking a bank transfer, and
          read as filler wherever it was true. The field stays: a shop that
          wants a line under the button writes its own. */}
      {trustText && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', margin: 0, textAlign: 'center' }}>
          {trustText}
        </p>
      )}
    </section>
  )
}
