'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getCart, subscribeCart } from '@/modules/shop/components/public/cart'

export type ShopCartSummaryProps = Record<string, never>

function CartWidget() {
  const [count, setCount] = useState(0)
  const [subtotal, setSubtotal] = useState<number | null>(null)
  const [currencySymbol, setCurrencySymbol] = useState('£')

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      const lines = getCart()
      setCount(lines.reduce((sum, l) => sum + l.quantity, 0))
      if (lines.length === 0) { setSubtotal(0); return }

      const [validateRes, configRes] = await Promise.all([
        fetch('/api/m/shop/public/cart/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines }) }),
        fetch('/api/m/shop/public/config'),
      ])
      if (cancelled) return
      if (validateRes.ok) {
        const data = await validateRes.json()
        setSubtotal(data.lines.reduce((sum: number, l: { lineSubtotal: number }) => sum + l.lineSubtotal, 0))
      }
      if (configRes.ok) {
        const config = await configRes.json()
        setCurrencySymbol(config.currencySymbol)
      }
    }

    refresh()
    const unsubscribe = subscribeCart(refresh)
    return () => { cancelled = true; unsubscribe() }
  }, [])

  return (
    <Link href="/shop/cart" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.5rem 0.875rem' }}>
      <span aria-hidden>🛒</span>
      <span>{count} item{count === 1 ? '' : 's'}</span>
      {subtotal != null && <span style={{ fontWeight: 600 }}>{currencySymbol}{subtotal.toFixed(2)}</span>}
    </Link>
  )
}

export function ShopCartSummary() {
  return <CartWidget />
}

export const shopCartSummaryPuckComponent = {
  label: 'Shop: Cart Summary',
  fields: {},
  defaultProps: {},
  render: ShopCartSummary,
}

export const shopCartSummaryPuckRscComponent = shopCartSummaryPuckComponent
