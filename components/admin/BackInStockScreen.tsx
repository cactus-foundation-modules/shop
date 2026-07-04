'use client'

import { useEffect, useState } from 'react'

type Subscription = { id: string; productId: string; email: string; notifiedAt: string | null; createdAt: string }

export function BackInStockScreen({ productId }: { productId?: string }) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])

  useEffect(() => {
    const params = new URLSearchParams()
    if (productId) params.set('productId', productId)
    fetch(`/api/m/shop/admin/back-in-stock?${params}`).then(async (r) => { if (r.ok) setSubscriptions((await r.json()).subscriptions) })
  }, [productId])

  const pending = subscriptions.filter((s) => !s.notifiedAt).length
  const fulfilled = subscriptions.filter((s) => s.notifiedAt).length

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Back-in-stock subscribers</h1></div>
      <p>{pending} pending, {fulfilled} fulfilled</p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}><th style={{ padding: '0.5rem' }}>Email</th><th>Status</th><th>Subscribed</th></tr></thead>
        <tbody>
          {subscriptions.map((s) => (
            <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '0.5rem' }}>{s.email}</td>
              <td>{s.notifiedAt ? 'Fulfilled' : 'Pending'}</td>
              <td>{new Date(s.createdAt).toLocaleDateString('en-GB')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
