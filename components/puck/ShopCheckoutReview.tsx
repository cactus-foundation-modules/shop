'use client'

import { useEffect, useState } from 'react'
import { getCart } from '@/modules/shop/components/public/cart'
import { getCheckoutState } from '@/modules/shop/components/public/checkout-state'

// [ANCHOR] - core checkout step (order review + place order).
export type ShopCheckoutReviewProps = Record<string, never>

type SessionSummary = {
  subtotal: number; discountAmount: number; shippingAmount: number; taxAmount: number; total: number
  currencySymbol: string; hasPreOrderItems: boolean
}

function ReviewForm() {
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [placing, setPlacing] = useState(false)

  useEffect(() => {
    const state = getCheckoutState()
    const lines = getCart()
    if (lines.length === 0) return
    fetch('/api/m/shop/public/checkout/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines, postcode: state.shippingAddress.postcode, shippingRateId: state.shippingRateId, couponCode: state.couponCode, customerEmail: state.customerEmail }),
    }).then(async (res) => {
      const data = await res.json()
      if (res.ok) setSummary(data)
      else setError(data.error ?? 'Could not load order summary')
    })

    function onError(e: Event) { setPlacing(false); setError((e as CustomEvent).detail) }
    window.addEventListener('cactus-shop-order-error', onError)
    return () => window.removeEventListener('cactus-shop-order-error', onError)
  }, [])

  function placeOrder() {
    setPlacing(true)
    setError(null)
    window.dispatchEvent(new CustomEvent('cactus-shop-place-order'))
  }

  if (!summary) return null

  return (
    <section style={{ display: 'grid', gap: '0.75rem', maxWidth: 480 }}>
      <h2 style={{ fontSize: '1.125rem', margin: 0 }}>Order review</h2>
      {summary.hasPreOrderItems && (
        <p style={{ background: 'var(--color-surface-muted)', borderRadius: 6, padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>
          This order contains a pre-order item.
        </p>
      )}
      <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.25rem 1rem', margin: 0 }}>
        <dt>Subtotal</dt><dd style={{ margin: 0 }}>{summary.currencySymbol}{summary.subtotal.toFixed(2)}</dd>
        {summary.discountAmount > 0 && <><dt>Discount</dt><dd style={{ margin: 0 }}>-{summary.currencySymbol}{summary.discountAmount.toFixed(2)}</dd></>}
        <dt>Shipping</dt><dd style={{ margin: 0 }}>{summary.currencySymbol}{summary.shippingAmount.toFixed(2)}</dd>
        <dt>Tax</dt><dd style={{ margin: 0 }}>{summary.currencySymbol}{summary.taxAmount.toFixed(2)}</dd>
        <dt style={{ fontWeight: 600 }}>Total</dt><dd style={{ margin: 0, fontWeight: 600 }}>{summary.currencySymbol}{summary.total.toFixed(2)}</dd>
      </dl>
      {error && <p style={{ color: 'var(--color-danger, #c00)' }}>{error}</p>}
      <button
        onClick={placeOrder}
        disabled={placing}
        style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 8, padding: '0.75rem 1.25rem', fontWeight: 600, cursor: 'pointer' }}
      >
        {placing ? 'Placing order…' : 'Place order'}
      </button>
    </section>
  )
}

export function ShopCheckoutReview() {
  return <ReviewForm />
}

export const shopCheckoutReviewPuckComponent = {
  label: 'Shop: Checkout - Review [Anchor]',
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: ShopCheckoutReview,
}

export const shopCheckoutReviewPuckRscComponent = shopCheckoutReviewPuckComponent
