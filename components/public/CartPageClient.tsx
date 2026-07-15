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

  async function refresh() {
    const cart = getCart()
    if (cart.length === 0) { setLines([]); setHasLoaded(true); return }
    const [validateRes, configRes] = await Promise.all([
      fetch('/api/m/shop/public/cart/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: cart }) }),
      fetch('/api/m/shop/public/config'),
    ])
    if (validateRes.ok) setLines((await validateRes.json()).lines)
    if (configRes.ok) setCurrencySymbol((await configRes.json()).currencySymbol)
    setHasLoaded(true)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- delegating to async helper; setState calls happen after awaits (or synchronously only to clear an already-empty cart)
    refresh()
    return subscribeCart(refresh)
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

  if (!hasLoaded) return null

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
