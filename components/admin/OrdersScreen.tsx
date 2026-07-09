'use client'

import { useEffect, useState } from 'react'
import { useAdminPath } from '@/components/admin/AdminPathContext'

type OrderRow = { id: string; orderNumber: string; status: string; paymentStatus: string; customerName: string; total: string; createdAt: string }

const TABS = ['ALL', 'PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'PRE_ORDER'] as const

export function OrdersScreen() {
  const adminPath = useAdminPath()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [tab, setTab] = useState<(typeof TABS)[number]>('ALL')

  useEffect(() => {
    const params = new URLSearchParams()
    if (tab === 'PRE_ORDER') params.set('preOrder', 'true')
    else if (tab !== 'ALL') params.set('status', tab)
    fetch(`/api/m/shop/admin/orders?${params}`).then(async (r) => { if (r.ok) setOrders((await r.json()).orders) })
  }, [tab])

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Orders</h1></div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ background: tab === t ? 'var(--color-primary)' : 'var(--color-bg-subtle)', color: tab === t ? 'var(--color-on-primary)' : 'inherit', border: 'none', borderRadius: 999, padding: '0.375rem 0.875rem', cursor: 'pointer', fontSize: '0.8125rem' }}>
            {t.replace('_', '-')}
          </button>
        ))}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
            <th style={{ padding: '0.5rem' }}>Order</th>
            <th style={{ padding: '0.5rem' }}>Customer</th>
            <th style={{ padding: '0.5rem' }}>Status</th>
            <th style={{ padding: '0.5rem' }}>Payment</th>
            <th style={{ padding: '0.5rem' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '0.5rem' }}><a href={`/${adminPath}/m/shop/orders/${o.id}`}>{o.orderNumber}</a></td>
              <td style={{ padding: '0.5rem' }}>{o.customerName}</td>
              <td style={{ padding: '0.5rem' }}>{o.status}</td>
              <td style={{ padding: '0.5rem' }}>{o.paymentStatus}</td>
              <td style={{ padding: '0.5rem' }}>{o.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
