'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getCart } from '@/modules/shop/components/public/cart'
import {
  getCheckoutState, subscribeCheckoutState, updateCheckoutState, areAgreementsAccepted,
  missingCheckoutFields, focusCheckoutField, checkoutBlockedSegments, type MissingCheckoutField,
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

  function placeOrder() {
    // The button is disabled while anything is outstanding, so this is a guard
    // rather than a code path - it exists so a stale render can never post.
    if (outstandingDecisions().length > 0 || missingCheckoutFields(getCheckoutState(), { businessNameRequired, businessNameLabel, phoneRequired }).length > 0) return
    setPlacing(true)
    setError(null)
    window.dispatchEvent(new CustomEvent('cactus-shop-place-order'))
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
      </section>
    )
  }


  const money = (n: number) => `${summary.currencySymbol}${n.toFixed(2)}`
  // Both halves hold the button shut: the boxes above, and the decisions on this
  // block. Neither hides the total any more, and both are said in the one line.
  const blocked = notice !== null

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
      <button
        onClick={placeOrder}
        disabled={placing || blocked}
        aria-describedby={notice ? 'shop-place-order-blocked' : undefined}
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
