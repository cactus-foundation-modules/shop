'use client'

import { useEffect, useState } from 'react'

type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING'

type Coupon = {
  id: string; code: string; type: DiscountType; value: string | null; usageCount: number; usageLimit: number | null
  perCustomerLimit: number | null; minimumOrderValue: string | null; startsAt: string | null; expiresAt: string | null; isActive: boolean
}
type AutoDiscount = {
  id: string; name: string; type: DiscountType; value: string | null; priority: number; isActive: boolean
  minimumOrderValue: string | null; freeShippingThreshold: string | null; startsAt: string | null; expiresAt: string | null
}

type CouponForm = {
  code: string; type: DiscountType; value: string; minimumOrderValue: string; usageLimit: string; perCustomerLimit: string; startsAt: string; expiresAt: string
}
type AutoDiscountForm = {
  name: string; type: DiscountType; value: string; minimumOrderValue: string; freeShippingThreshold: string; priority: string; startsAt: string; expiresAt: string
}

const emptyCouponForm: CouponForm = { code: '', type: 'PERCENTAGE', value: '', minimumOrderValue: '', usageLimit: '', perCustomerLimit: '', startsAt: '', expiresAt: '' }
const emptyAutoForm: AutoDiscountForm = { name: '', type: 'PERCENTAGE', value: '', minimumOrderValue: '', freeShippingThreshold: '', priority: '0', startsAt: '', expiresAt: '' }

function numOrNull(v: string): number | null {
  return v.trim() === '' ? null : Number(v)
}
function dateOrNull(v: string): string | null {
  return v.trim() === '' ? null : new Date(v).toISOString()
}

export function DiscountsScreen() {
  const [tab, setTab] = useState<'coupons' | 'automatic'>('coupons')
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [autoDiscounts, setAutoDiscounts] = useState<AutoDiscount[]>([])
  const [couponForm, setCouponForm] = useState<CouponForm | null>(null)
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null)
  const [autoForm, setAutoForm] = useState<AutoDiscountForm | null>(null)
  const [editingAutoId, setEditingAutoId] = useState<string | null>(null)

  function refresh() {
    fetch('/api/m/shop/admin/coupons').then(async (r) => { if (r.ok) setCoupons((await r.json()).coupons) })
    fetch('/api/m/shop/admin/automatic-discounts').then(async (r) => { if (r.ok) setAutoDiscounts((await r.json()).discounts) })
  }
  useEffect(refresh, [])

  function startEditCoupon(c?: Coupon) {
    if (c) {
      setEditingCouponId(c.id)
      setCouponForm({
        code: c.code, type: c.type, value: c.value ?? '', minimumOrderValue: c.minimumOrderValue ?? '',
        usageLimit: c.usageLimit?.toString() ?? '', perCustomerLimit: c.perCustomerLimit?.toString() ?? '',
        startsAt: c.startsAt?.slice(0, 10) ?? '', expiresAt: c.expiresAt?.slice(0, 10) ?? '',
      })
    } else {
      setEditingCouponId(null)
      setCouponForm(emptyCouponForm)
    }
  }

  async function saveCoupon() {
    if (!couponForm) return
    const body = {
      code: couponForm.code, type: couponForm.type, value: couponForm.type === 'FREE_SHIPPING' ? null : numOrNull(couponForm.value),
      minimumOrderValue: numOrNull(couponForm.minimumOrderValue), usageLimit: numOrNull(couponForm.usageLimit),
      perCustomerLimit: numOrNull(couponForm.perCustomerLimit), startsAt: dateOrNull(couponForm.startsAt), expiresAt: dateOrNull(couponForm.expiresAt),
    }
    const url = editingCouponId ? `/api/m/shop/admin/coupons/${editingCouponId}` : '/api/m/shop/admin/coupons'
    const res = await fetch(url, { method: editingCouponId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) { alert((await res.json()).error ?? 'Could not save coupon'); return }
    setCouponForm(null)
    setEditingCouponId(null)
    refresh()
  }

  async function toggleCoupon(c: Coupon) {
    await fetch(`/api/m/shop/admin/coupons/${c.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !c.isActive }) })
    refresh()
  }

  async function deleteCoupon(c: Coupon) {
    if (!confirm(`Delete coupon "${c.code}"?`)) return
    await fetch(`/api/m/shop/admin/coupons/${c.id}`, { method: 'DELETE' })
    refresh()
  }

  function startEditAuto(d?: AutoDiscount) {
    if (d) {
      setEditingAutoId(d.id)
      setAutoForm({
        name: d.name, type: d.type, value: d.value ?? '', minimumOrderValue: d.minimumOrderValue ?? '',
        freeShippingThreshold: d.freeShippingThreshold ?? '', priority: d.priority.toString(),
        startsAt: d.startsAt?.slice(0, 10) ?? '', expiresAt: d.expiresAt?.slice(0, 10) ?? '',
      })
    } else {
      setEditingAutoId(null)
      setAutoForm(emptyAutoForm)
    }
  }

  async function saveAutoDiscount() {
    if (!autoForm) return
    const body = {
      name: autoForm.name, type: autoForm.type, value: autoForm.type === 'FREE_SHIPPING' ? null : numOrNull(autoForm.value),
      minimumOrderValue: numOrNull(autoForm.minimumOrderValue), freeShippingThreshold: numOrNull(autoForm.freeShippingThreshold),
      priority: Number(autoForm.priority) || 0, startsAt: dateOrNull(autoForm.startsAt), expiresAt: dateOrNull(autoForm.expiresAt),
    }
    const url = editingAutoId ? `/api/m/shop/admin/automatic-discounts/${editingAutoId}` : '/api/m/shop/admin/automatic-discounts'
    const res = await fetch(url, { method: editingAutoId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) { alert((await res.json()).error ?? 'Could not save discount'); return }
    setAutoForm(null)
    setEditingAutoId(null)
    refresh()
  }

  async function toggleAutoDiscount(d: AutoDiscount) {
    await fetch(`/api/m/shop/admin/automatic-discounts/${d.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !d.isActive }) })
    refresh()
  }

  async function deleteAutoDiscount(d: AutoDiscount) {
    if (!confirm(`Delete automatic discount "${d.name}"?`)) return
    await fetch(`/api/m/shop/admin/automatic-discounts/${d.id}`, { method: 'DELETE' })
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
          <button onClick={() => startEditCoupon()} className="btn btn-primary" style={{ marginBottom: '1rem' }}>New coupon</button>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}><th style={{ padding: '0.5rem' }}>Code</th><th>Type</th><th>Value</th><th>Usage</th><th>Expires</th><th>Active</th><th /></tr></thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.5rem' }}>{c.code}</td><td>{c.type}</td><td>{c.value ?? '—'}</td>
                  <td>{c.usageCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                  <td>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : '—'}</td>
                  <td><button onClick={() => toggleCoupon(c)} style={linkButton}>{c.isActive ? 'Deactivate' : 'Activate'}</button></td>
                  <td style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => startEditCoupon(c)} style={linkButton}>Edit</button>
                    <button onClick={() => deleteCoupon(c)} style={linkButton}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {couponForm && (
            <div className="card" style={{ padding: '1rem', marginTop: '1rem', display: 'grid', gap: '0.5rem', maxWidth: 480 }}>
              <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>{editingCouponId ? 'Edit coupon' : 'New coupon'}</h3>
              <label>Code<input value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value })} style={inputStyle} /></label>
              <label>
                Type
                <select value={couponForm.type} onChange={(e) => setCouponForm({ ...couponForm, type: e.target.value as DiscountType })} style={inputStyle}>
                  <option value="PERCENTAGE">Percentage off</option>
                  <option value="FIXED_AMOUNT">Fixed amount off</option>
                  <option value="FREE_SHIPPING">Free shipping</option>
                </select>
              </label>
              {couponForm.type !== 'FREE_SHIPPING' && (
                <label>{couponForm.type === 'PERCENTAGE' ? 'Percentage off (e.g. 10)' : 'Amount off'}<input type="number" step="0.01" value={couponForm.value} onChange={(e) => setCouponForm({ ...couponForm, value: e.target.value })} style={inputStyle} /></label>
              )}
              <label>Minimum order value<input type="number" step="0.01" value={couponForm.minimumOrderValue} onChange={(e) => setCouponForm({ ...couponForm, minimumOrderValue: e.target.value })} style={inputStyle} /></label>
              <label>Usage limit (total uses)<input type="number" value={couponForm.usageLimit} onChange={(e) => setCouponForm({ ...couponForm, usageLimit: e.target.value })} style={inputStyle} /></label>
              <label>Per-customer limit<input type="number" value={couponForm.perCustomerLimit} onChange={(e) => setCouponForm({ ...couponForm, perCustomerLimit: e.target.value })} style={inputStyle} /></label>
              <label>Starts<input type="date" value={couponForm.startsAt} onChange={(e) => setCouponForm({ ...couponForm, startsAt: e.target.value })} style={inputStyle} /></label>
              <label>Expires<input type="date" value={couponForm.expiresAt} onChange={(e) => setCouponForm({ ...couponForm, expiresAt: e.target.value })} style={inputStyle} /></label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={saveCoupon} className="btn btn-primary">Save</button>
                <button onClick={() => setCouponForm(null)} className="btn btn-secondary">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'automatic' && (
        <div>
          <button onClick={() => startEditAuto()} className="btn btn-primary" style={{ marginBottom: '1rem' }}>New automatic discount</button>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}><th style={{ padding: '0.5rem' }}>Name</th><th>Type</th><th>Value</th><th>Priority</th><th>Active</th><th /></tr></thead>
            <tbody>
              {autoDiscounts.map((d) => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.5rem' }}>{d.name}</td><td>{d.type}</td><td>{d.value ?? '—'}</td><td>{d.priority}</td>
                  <td><button onClick={() => toggleAutoDiscount(d)} style={linkButton}>{d.isActive ? 'Deactivate' : 'Activate'}</button></td>
                  <td style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => startEditAuto(d)} style={linkButton}>Edit</button>
                    <button onClick={() => deleteAutoDiscount(d)} style={linkButton}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {autoForm && (
            <div className="card" style={{ padding: '1rem', marginTop: '1rem', display: 'grid', gap: '0.5rem', maxWidth: 480 }}>
              <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>{editingAutoId ? 'Edit automatic discount' : 'New automatic discount'}</h3>
              <label>Name<input value={autoForm.name} onChange={(e) => setAutoForm({ ...autoForm, name: e.target.value })} style={inputStyle} /></label>
              <label>
                Type
                <select value={autoForm.type} onChange={(e) => setAutoForm({ ...autoForm, type: e.target.value as DiscountType })} style={inputStyle}>
                  <option value="PERCENTAGE">Percentage off</option>
                  <option value="FIXED_AMOUNT">Fixed amount off</option>
                  <option value="FREE_SHIPPING">Free shipping</option>
                </select>
              </label>
              {autoForm.type !== 'FREE_SHIPPING' && (
                <label>{autoForm.type === 'PERCENTAGE' ? 'Percentage off (e.g. 10)' : 'Amount off'}<input type="number" step="0.01" value={autoForm.value} onChange={(e) => setAutoForm({ ...autoForm, value: e.target.value })} style={inputStyle} /></label>
              )}
              <label>Minimum order value<input type="number" step="0.01" value={autoForm.minimumOrderValue} onChange={(e) => setAutoForm({ ...autoForm, minimumOrderValue: e.target.value })} style={inputStyle} /></label>
              {autoForm.type === 'FREE_SHIPPING' && (
                <label>Free-shipping threshold<input type="number" step="0.01" value={autoForm.freeShippingThreshold} onChange={(e) => setAutoForm({ ...autoForm, freeShippingThreshold: e.target.value })} style={inputStyle} /></label>
              )}
              <label>Priority (higher applies first)<input type="number" value={autoForm.priority} onChange={(e) => setAutoForm({ ...autoForm, priority: e.target.value })} style={inputStyle} /></label>
              <label>Starts<input type="date" value={autoForm.startsAt} onChange={(e) => setAutoForm({ ...autoForm, startsAt: e.target.value })} style={inputStyle} /></label>
              <label>Expires<input type="date" value={autoForm.expiresAt} onChange={(e) => setAutoForm({ ...autoForm, expiresAt: e.target.value })} style={inputStyle} /></label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={saveAutoDiscount} className="btn btn-primary">Save</button>
                <button onClick={() => setAutoForm(null)} className="btn btn-secondary">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)', marginTop: '0.25rem' }
const linkButton: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', padding: 0 }
