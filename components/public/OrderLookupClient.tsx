'use client'

import { useState } from 'react'
import { formatMoney } from '@/modules/shop/lib/money'

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
    const res = await fetch(`/api/m/shop/public/orders/status?orderNumber=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(email)}`)
    const body = await res.json()
    setLoading(false)
    if (res.ok) setData(body)
    else setError(body.error ?? 'Order not found')
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
