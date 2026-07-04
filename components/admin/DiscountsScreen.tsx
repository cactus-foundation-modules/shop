'use client'

import { useEffect, useState } from 'react'

type Coupon = { id: string; code: string; type: string; value: string | null; usageCount: number; usageLimit: number | null; isActive: boolean }
type AutoDiscount = { id: string; name: string; type: string; value: string | null; priority: number; isActive: boolean }

export function DiscountsScreen() {
  const [tab, setTab] = useState<'coupons' | 'automatic'>('coupons')
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [autoDiscounts, setAutoDiscounts] = useState<AutoDiscount[]>([])

  function refresh() {
    fetch('/api/m/shop/admin/coupons').then(async (r) => { if (r.ok) setCoupons((await r.json()).coupons) })
    fetch('/api/m/shop/admin/automatic-discounts').then(async (r) => { if (r.ok) setAutoDiscounts((await r.json()).discounts) })
  }
  useEffect(refresh, [])

  async function createCoupon() {
    const code = prompt('Coupon code?')
    if (!code) return
    const value = prompt('Percentage off (e.g. 10)?')
    await fetch('/api/m/shop/admin/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, type: 'PERCENTAGE', value: Number(value ?? 0) }) })
    refresh()
  }

  async function toggleCoupon(c: Coupon) {
    await fetch(`/api/m/shop/admin/coupons/${c.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !c.isActive }) })
    refresh()
  }

  async function createAutoDiscount() {
    const name = prompt('Discount name?')
    if (!name) return
    const value = prompt('Percentage off (e.g. 10)?')
    await fetch('/api/m/shop/admin/automatic-discounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, type: 'PERCENTAGE', value: Number(value ?? 0) }) })
    refresh()
  }

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Discounts</h1></div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={() => setTab('coupons')} style={{ fontWeight: tab === 'coupons' ? 700 : 400, background: 'none', border: 'none', cursor: 'pointer' }}>Coupons</button>
        <button onClick={() => setTab('automatic')} style={{ fontWeight: tab === 'automatic' ? 700 : 400, background: 'none', border: 'none', cursor: 'pointer' }}>Automatic</button>
      </div>

      {tab === 'coupons' && (
        <div>
          <button onClick={createCoupon} className="btn btn-primary" style={{ marginBottom: '1rem' }}>New coupon</button>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}><th style={{ padding: '0.5rem' }}>Code</th><th>Type</th><th>Value</th><th>Usage</th><th>Active</th></tr></thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.5rem' }}>{c.code}</td><td>{c.type}</td><td>{c.value}</td>
                  <td>{c.usageCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                  <td><button onClick={() => toggleCoupon(c)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>{c.isActive ? 'Deactivate' : 'Activate'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'automatic' && (
        <div>
          <button onClick={createAutoDiscount} className="btn btn-primary" style={{ marginBottom: '1rem' }}>New automatic discount</button>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}><th style={{ padding: '0.5rem' }}>Name</th><th>Type</th><th>Value</th><th>Priority</th></tr></thead>
            <tbody>
              {autoDiscounts.map((d) => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.5rem' }}>{d.name}</td><td>{d.type}</td><td>{d.value}</td><td>{d.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
