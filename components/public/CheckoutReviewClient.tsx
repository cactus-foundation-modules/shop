'use client'

import { useEffect, useRef, useState } from 'react'
import { getCart } from '@/modules/shop/components/public/cart'
import {
  getCheckoutState, subscribeCheckoutState, updateCheckoutState, areAgreementsAccepted,
  missingCheckoutFields, focusCheckoutField, type MissingCheckoutField,
} from '@/modules/shop/components/public/checkout-state'
import { useCartPopulated } from '@/modules/shop/components/public/use-cart-populated'

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

// Client island for the checkout review step (order summary + place order).
// Registered Puck block wrapper (ShopCheckoutReview) is a server component that
// renders this, so Puck's RSC <Render> never serialises its renderDropZone
// function bag into the client.
export function CheckoutReviewClient({ preview = false, heading, buttonLabel, trustText }: { preview?: boolean; heading?: string; buttonLabel?: string; trustText?: string }) {
  const populated = useCartPopulated(preview)
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
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
  const [businessNameRequired, setBusinessNameRequired] = useState(false)
  const [businessNameLabel, setBusinessNameLabel] = useState('')
  const [phoneRequired, setPhoneRequired] = useState(false)
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

  useEffect(() => {
    let cancelled = false
    fetch('/api/m/shop/public/config')
      .then((r) => r.json())
      .then((d: { checkoutAgreements?: Agreement[]; businessName?: { required?: boolean; label?: string }; requirePhone?: boolean }) => {
        if (cancelled) return
        setAgreements(d.checkoutAgreements ?? [])
        setBusinessNameRequired(d.businessName?.required === true)
        // The owner's own wording for that box, so the outstanding list calls it
        // what the form above calls it rather than inventing a name for it.
        setBusinessNameLabel(d.businessName?.label ?? '')
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
      setMissing(missingCheckoutFields(state, { businessNameRequired, businessNameLabel, phoneRequired }))
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

    function onError(e: Event) { setPlacing(false); setError((e as CustomEvent).detail) }
    window.addEventListener('cactus-shop-order-error', onError)
    return () => {
      unsubscribe()
      window.removeEventListener('cactus-shop-order-error', onError)
      if (timer) clearTimeout(timer)
    }
    // Re-runs when the business-name and phone rules arrive from config: the
    // completeness test above closes over them, so a stale `false` would wave
    // through a checkout the order route is about to refuse.
  }, [businessNameRequired, businessNameLabel, phoneRequired])

  function setAgreement(id: string, accepted: boolean) {
    const next = { ...getCheckoutState().agreements, [id]: accepted }
    setTicked(next)
    updateCheckoutState({ agreements: next })
  }

  // What is still outstanding ON THIS BLOCK, in the order the page presents it,
  // as one sentence. Null means nothing here is holding the button - the boxes
  // further up the page are listed separately, as rows that jump to them. The
  // button reads both rather than shouting after a click: a shopper should be
  // able to see what is left, not discover it by being refused - and see all of
  // it, not be sent back for the second thing once they have done the first.
  function blockedReason(): string | null {
    const outstanding: string[] = []
    if (!paymentMethod) outstanding.push('choose a payment method above')
    if (!areAgreementsAccepted(ticked, agreements)) {
      outstanding.push(`tick the box${agreements.filter((a) => a.required).length === 1 ? '' : 'es'} marked *`)
    }
    if (outstanding.length === 0) return null
    const sentence = outstanding.join(' and ')
    return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} to place your order.`
  }

  function placeOrder() {
    // The button is disabled while anything is outstanding, so this is a guard
    // rather than a code path - it exists so a stale render can never post.
    if (blockedReason() || missingCheckoutFields(getCheckoutState(), { businessNameRequired, businessNameLabel, phoneRequired }).length > 0) return
    setPlacing(true)
    setError(null)
    window.dispatchEvent(new CustomEvent('cactus-shop-place-order'))
  }

  // Empty basket: no order to review, no total to show, nothing to place - the
  // order-summary block carries the empty message.
  if (!populated) return null

  // What is still owed in the boxes above, as rows that take the shopper to the
  // box in question. Shown BESIDE the totals rather than instead of them: the
  // figures are what a shopper opened this step for, and an order they cannot
  // price yet is an order they cannot decide on.
  const outstanding = missing.length === 0 ? null : (
    <div id="shop-place-order-missing" style={{ display: 'grid', gap: '0.5rem' }}>
      <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
        Still to fill in above before you can place this order:
      </p>
      <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'grid', gap: '0.25rem' }}>
        {missing.map((field) => (
          <li key={field.key}>
            {/* A button rather than a line of text: naming the field is most of
                the answer, but on a long checkout the shopper still has to go
                and find it, and the page can do that. */}
            <button
              type="button"
              onClick={() => focusCheckoutField(field.key)}
              style={{
                background: 'none', border: 0, padding: 0, font: 'inherit',
                color: 'var(--color-primary)', textDecoration: 'underline', cursor: 'pointer',
              }}
            >
              {field.label}
            </button>
            {/* The wording comes with the row, from whoever decided the box was
                wrong. Naming a specific field here is what had a phone number
                told it did not look like an email address. */}
            {field.reason === 'invalid' && field.hint && (
              <span style={{ color: 'var(--color-text-secondary)' }}> - {field.hint}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )

  // No total yet: the first request is still out, or the shop refused to price
  // this basket (a minimum order, a line that has just sold out). Either way the
  // outstanding list still belongs on screen.
  if (!summary) {
    return (
      // The top margin is the gap to the step above: these are separate blocks
      // in one Puck zone, so nothing else puts air between the checkout steps.
      <section style={{ display: 'grid', gap: '0.75rem', maxWidth: 480, marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', margin: 0 }}>{heading || 'Order review'}</h2>
        {error
          ? <p style={{ color: 'var(--color-danger)', margin: 0 }}>{error}</p>
          : <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>Working out your order total…</p>}
        {outstanding}
      </section>
    )
  }


  const money = (n: number) => `${summary.currencySymbol}${n.toFixed(2)}`
  const reason = blockedReason()
  // Both halves hold the button shut: the boxes above, and the decisions on this
  // block. Neither hides the total any more.
  const blocked = reason !== null || missing.length > 0
  const describedBy = [reason ? 'shop-place-order-blocked' : null, missing.length > 0 ? 'shop-place-order-missing' : null]
    .filter(Boolean).join(' ')

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
              <input
                type="checkbox"
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
      {outstanding}
      {reason && (
        <p id="shop-place-order-blocked" role="status" style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem', margin: 0 }}>
          {reason}
        </p>
      )}
      <button
        onClick={placeOrder}
        disabled={placing || blocked}
        aria-describedby={describedBy || undefined}
        style={{
          background: blocked ? 'var(--color-bg-subtle)' : 'var(--color-primary)',
          // Secondary rather than muted: a disabled control still has to be
          // readable, and muted-on-subtle misses AA in both themes.
          color: blocked ? 'var(--color-text-secondary)' : 'var(--color-on-primary)',
          // Transparent rather than none, so the button does not change size
          // when it becomes placeable.
          border: `1px solid ${blocked ? 'var(--color-border)' : 'transparent'}`,
          borderRadius: 8, padding: '0.75rem 1.25rem', fontWeight: 600,
          cursor: blocked ? 'not-allowed' : 'pointer',
        }}
      >
        {/* The button states exactly what happens, amount included - no
            surprises on the far side of a click. */}
        {placing ? 'Placing order…' : `${buttonLabel || 'Place order'} - ${money(summary.total)}`}
      </button>
      {/* Absent prop = the standard line (every layout saved before the block
          had wording settings); set blank on the block to drop the line. */}
      {(trustText ?? '🔒 Payment details are encrypted and never stored by this site.') && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', margin: 0, textAlign: 'center' }}>
          {trustText ?? '🔒 Payment details are encrypted and never stored by this site.'}
        </p>
      )}
    </section>
  )
}
