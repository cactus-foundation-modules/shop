'use client'

import { useEffect, useState } from 'react'
import { getCart } from '@/modules/shop/components/public/cart'
import { getCheckoutState, isContactAndShippingComplete, subscribeCheckoutState } from '@/modules/shop/components/public/checkout-state'
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

// Client island for the checkout review step (order summary + place order).
// Registered Puck block wrapper (ShopCheckoutReview) is a server component that
// renders this, so Puck's RSC <Render> never serialises its renderDropZone
// function bag into the client.
export function CheckoutReviewClient({ preview = false }: { preview?: boolean }) {
  const populated = useCartPopulated(preview)
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [incomplete, setIncomplete] = useState(true)
  const [placing, setPlacing] = useState(false)

  useEffect(() => {
    function loadSummary() {
      const state = getCheckoutState()
      const lines = getCart()
      if (lines.length === 0 || !isContactAndShippingComplete(state)) {
        setIncomplete(true)
        setSummary(null)
        return
      }
      setIncomplete(false)
      fetch('/api/m/shop/public/checkout/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines, postcode: state.shippingAddress.postcode, shippingRateId: state.shippingRateId, couponCode: state.couponCode, customerEmail: state.customerEmail }),
      }).then(async (res) => {
        const data = await res.json()
        if (res.ok) { setSummary(data); setError(null) }
        else setError(data.error ?? 'Could not load order summary')
      })
    }

    loadSummary()
    const unsubscribe = subscribeCheckoutState(loadSummary)

    function onError(e: Event) { setPlacing(false); setError((e as CustomEvent).detail) }
    window.addEventListener('cactus-shop-order-error', onError)
    return () => { unsubscribe(); window.removeEventListener('cactus-shop-order-error', onError) }
  }, [])

  function placeOrder() {
    setPlacing(true)
    setError(null)
    window.dispatchEvent(new CustomEvent('cactus-shop-place-order'))
  }

  // Empty basket: no order to review, no total to show, nothing to place - the
  // order-summary block carries the empty message.
  if (!populated) return null

  if (incomplete) {
    return (
      <section style={{ display: 'grid', gap: '0.75rem', maxWidth: 480 }}>
        <h2 style={{ fontSize: '1.125rem', margin: 0 }}>Order review</h2>
        <p style={{ color: 'var(--color-text-muted)' }}>Fill in your contact and shipping details above to see your order total.</p>
      </section>
    )
  }
  if (!summary) return error ? <p style={{ color: 'var(--color-danger)' }}>{error}</p> : null

  const money = (n: number) => `${summary.currencySymbol}${n.toFixed(2)}`

  return (
    <section style={{ display: 'grid', gap: '0.75rem', maxWidth: 480 }}>
      <h2 style={{ fontSize: '1.125rem', margin: 0 }}>Order review</h2>
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
      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
      <button
        onClick={placeOrder}
        disabled={placing}
        style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 8, padding: '0.75rem 1.25rem', fontWeight: 600, cursor: 'pointer' }}
      >
        {/* The button states exactly what happens, amount included - no
            surprises on the far side of a click. */}
        {placing ? 'Placing order…' : `Place order - ${money(summary.total)}`}
      </button>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', margin: 0, textAlign: 'center' }}>
        🔒 Payment details are encrypted and never stored by this site.
      </p>
    </section>
  )
}
