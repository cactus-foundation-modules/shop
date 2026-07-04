'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type RevenueDay = { day: string; revenue: string; orderCount: number }
type TaxRow = { taxRate: string; orderCount: number; taxCollected: string }

export function ReportsScreen() {
  const [tab, setTab] = useState<'revenue' | 'tax'>('revenue')
  const [revenue, setRevenue] = useState<RevenueDay[]>([])
  const [tax, setTax] = useState<TaxRow[]>([])

  useEffect(() => {
    fetch('/api/m/shop/admin/reports/revenue').then(async (r) => { if (r.ok) setRevenue((await r.json()).days) })
    fetch('/api/m/shop/admin/reports/tax').then(async (r) => { if (r.ok) setTax((await r.json()).report) })
  }, [])

  const totalRevenue = revenue.reduce((sum, d) => sum + Number(d.revenue), 0)
  const totalOrders = revenue.reduce((sum, d) => sum + d.orderCount, 0)

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Reports</h1></div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={() => setTab('revenue')} style={{ fontWeight: tab === 'revenue' ? 700 : 400, background: 'none', border: 'none', cursor: 'pointer' }}>Revenue</button>
        <button onClick={() => setTab('tax')} style={{ fontWeight: tab === 'tax' ? 700 : 400, background: 'none', border: 'none', cursor: 'pointer' }}>Tax</button>
      </div>

      {tab === 'revenue' && (
        <div>
          <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{totalRevenue.toFixed(2)}</div><div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Revenue (90d)</div></div>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{totalOrders}</div><div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Orders (90d)</div></div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}><th style={{ padding: '0.5rem' }}>Day</th><th>Revenue</th><th>Orders</th></tr></thead>
            <tbody>{revenue.map((d) => <tr key={d.day} style={{ borderBottom: '1px solid var(--color-border)' }}><td style={{ padding: '0.5rem' }}>{new Date(d.day).toLocaleDateString('en-GB')}</td><td>{d.revenue}</td><td>{d.orderCount}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {tab === 'tax' && (
        <div>
          <Link href="/api/m/shop/admin/reports/tax?format=csv" className="btn btn-secondary" style={{ marginBottom: '1rem', display: 'inline-block' }}>Export CSV</Link>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}><th style={{ padding: '0.5rem' }}>Tax rate</th><th>Orders</th><th>Tax collected</th></tr></thead>
            <tbody>{tax.map((t) => <tr key={t.taxRate} style={{ borderBottom: '1px solid var(--color-border)' }}><td style={{ padding: '0.5rem' }}>{(Number(t.taxRate) * 100).toFixed(1)}%</td><td>{t.orderCount}</td><td>{t.taxCollected}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
