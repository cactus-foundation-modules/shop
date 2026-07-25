'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getCart, setLineQuantity, removeFromCart, subscribeCart } from '@/modules/shop/components/public/cart'
import { updateCheckoutState } from '@/modules/shop/components/public/checkout-state'
import { formatMoney } from '@/modules/shop/lib/money'
import type { LineMeta } from '@/modules/shop/lib/types'

type ValidatedLine = {
  productId: string; name: string; slug: string; quantity: number; unitPrice: number
  lineSubtotal: number; available: boolean; availabilityReason: string | null
  isPreOrder: boolean; imageUrl: string | null
  lineId?: string | null; lineMeta?: LineMeta | null
}

const lineKey = (l: Pick<ValidatedLine, 'productId' | 'lineId'>) => l.lineId ?? l.productId

export function CartPageClient() {
  const [lines, setLines] = useState<ValidatedLine[]>([])
  const [currencySymbol, setCurrencySymbol] = useState('£')
  const [couponCode, setCouponCode] = useState('')
  const [couponMessage, setCouponMessage] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)

  // Currency symbol is fixed for the shop - fetch it once, not on every cart
  // re-validate (it used to ride along with each validate round-trip).
  useEffect(() => {
    let cancelled = false
    fetch('/api/m/shop/public/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setCurrencySymbol(data.currencySymbol) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    // Monotonic guard so a slow earlier re-validate can't overwrite a newer one.
    let seq = 0
    async function refresh() {
      const cart = getCart()
      if (cart.length === 0) { if (!cancelled) { setLines([]); setHasLoaded(true) } return }
      const mySeq = ++seq
      const res = await fetch('/api/m/shop/public/cart/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: cart }),
      })
      if (cancelled || mySeq !== seq) return
      const data = res.ok ? await res.json() : null
      if (cancelled || mySeq !== seq) return
      if (data) setLines(data.lines)
      setHasLoaded(true)
    }
    refresh()
    const unsubscribe = subscribeCart(refresh)
    return () => { cancelled = true; unsubscribe() }
  }, [])

  async function applyCoupon() {
    if (!couponCode) return
    const cart = getCart()
    const res = await fetch('/api/m/shop/public/checkout/apply-coupon', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: cart, couponCode }),
    })
    const data = await res.json()
    if (res.ok) {
      updateCheckoutState({ couponCode })
      setCouponMessage(`Discount applied: ${currencySymbol}${data.discountAmount.toFixed(2)}`)
    } else {
      setCouponMessage(data.error ?? 'Invalid coupon')
    }
  }

  const subtotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0)

  // Shimmer skeleton while the localStorage cart is validated, so the page
  // never flashes blank (the validate call folds delivery/personalisation
  // resolvers and can take a moment).
  if (!hasLoaded) {
    return (
      <div style={{ display: 'grid', gap: '1rem', maxWidth: 640 }} aria-busy="true" aria-label="Loading your cart">
        {[0, 1].map((i) => (
          <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
            <div className="skeleton" style={{ width: 64, height: 64, borderRadius: 6, flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'grid', gap: '0.4rem' }}>
              <div className="skeleton" style={{ height: 14, width: '65%' }} />
              <div className="skeleton" style={{ height: 12, width: '35%' }} />
            </div>
            <div className="skeleton" style={{ height: 14, width: 60 }} />
          </div>
        ))}
        <div className="skeleton" style={{ height: 44, width: '100%', borderRadius: 8 }} />
      </div>
    )
  }

  if (lines.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>Your cart is empty. <Link href="/shop">Continue shopping</Link>.</p>
  }

  return (
    <div style={{ display: 'grid', gap: '1rem', maxWidth: 640 }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
        {lines.map((line) => (
          <li key={lineKey(line)} style={{ display: 'flex', gap: '1rem', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
            {line.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={line.imageUrl} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6 }} />
            )}
            <div style={{ flex: 1 }}>
              <a href={`/shop/products/${line.slug}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>{line.name}</a>
              {!line.available && <p style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', margin: '0.25rem 0 0' }}>{line.availabilityReason}</p>}
              {line.isPreOrder && <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0' }}>Pre-order</p>}
              {line.lineMeta?.fields?.length ? (
                <ul style={{ listStyle: 'none', margin: '0.25rem 0 0', padding: 0, display: 'grid', gap: '0.125rem' }}>
                  {line.lineMeta.fields.map((f, i) => (
                    <li key={i} style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                      <span style={{ fontWeight: 500 }}>{f.label}:</span>{' '}
                      {f.href ? <a href={f.href} target="_blank" rel="noopener noreferrer">{f.value}</a> : f.value}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <input
              type="number" min={0} value={line.quantity}
              aria-label={`Quantity for ${line.name}`}
              onChange={(e) => setLineQuantity(lineKey(line), Math.max(0, Number(e.target.value)))}
              style={{ width: 56, padding: '0.375rem', borderRadius: 6, border: '1px solid var(--color-border)' }}
            />
            <span style={{ minWidth: 70, textAlign: 'right' }}>{formatMoney(line.lineSubtotal, currencySymbol)}</span>
            <button aria-label={`Remove ${line.name}`} onClick={() => removeFromCart(lineKey(line))} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>Remove</button>
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input aria-label="Coupon code" placeholder="Coupon code" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
        <button onClick={applyCoupon} style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer' }}>Apply</button>
      </div>
      {couponMessage && <p style={{ fontSize: '0.875rem' }}>{couponMessage}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '1.125rem' }}>
        <span>Subtotal</span><span>{currencySymbol}{subtotal.toFixed(2)}</span>
      </div>

      <Link href="/shop/checkout" style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)', textAlign: 'center', borderRadius: 8, padding: '0.75rem', fontWeight: 600, textDecoration: 'none' }}>
        Proceed to checkout
      </Link>
    </div>
  )
}
