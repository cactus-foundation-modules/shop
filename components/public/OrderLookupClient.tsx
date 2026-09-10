'use client'

import { useState } from 'react'
import { formatMoney } from '@/modules/shop/lib/money'

// The old way into an order: its number, printed on every email the shop sends,
// plus the email address it was placed with.
//
// It used to ask the status route for `?orderNumber=…&email=…` in one GET, which
// put a customer's address in a query string - and therefore in the site's
// access logs, in the browser's history and in the Referer header sent to every
// third party the next page loads. Worse, the resulting address WAS the key:
// anybody who came across it saw the whole order.
//
// So it is two steps now, and neither carries a secret in an address. The email
// is POSTed to the receipt-access route, which checks it and - if it is right -
// writes this browser a signed cookie saying it may see that order. The status
// route is then asked for the order by number alone and answers off the cookie.
// See app/api/public/orders/receipt-access and lib/receipt-access-cookie.

type OrderStatusData = {
  order: { orderNumber: string; status: string; total: string; paymentStatus: string }
  items: Array<{ productName: string; quantity: number; total: string }>
  currencySymbol: string
}

export function OrderLookupClient({ orderNumber }: { orderNumber: string }) {
  const [email, setEmail] = useState('')
  const [data, setData] = useState<OrderStatusData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function lookup() {
    setLoading(true)
    setError(null)
    try {
      const proof = await fetch('/api/m/shop/public/orders/receipt-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber, answer: email }),
      })
      const proofBody = await proof.json().catch(() => null)
      if (!proof.ok || !proofBody?.ok) {
        setError(proofBody?.error ?? 'Order not found')
        return
      }

      const res = await fetch(
        `/api/m/shop/public/orders/status?orderNumber=${encodeURIComponent(orderNumber)}`,
      )
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error ?? 'Order not found')
        return
      }
      setData(body)
    } catch {
      setError('We could not reach the shop just then. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (data) {
    return (
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <p>Status: <strong>{data.order.status}</strong> ({data.order.paymentStatus})</p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {data.items.map((item, i) => <li key={i}>{item.productName} x{item.quantity} - {formatMoney(item.total, data.currencySymbol)}</li>)}
        </ul>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '0.75rem', maxWidth: 400 }}>
      <p>Enter the email address used for order <strong>{orderNumber}</strong> to view its status.</p>
      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}
      <input type="email" aria-label="Email address" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
      <button onClick={lookup} disabled={loading} style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 8, padding: '0.625rem 1.25rem', fontWeight: 600, cursor: 'pointer', justifySelf: 'start' }}>
        {loading ? 'Looking up…' : 'View order'}
      </button>
    </div>
  )
}
