'use client'

import { useCallback, useEffect, useState } from 'react'
import { useConfirm, useAlert } from '@/modules/shop/components/admin/dialogs'

type Supplier = {
  id: string
  name: string
  accountNumber: string | null
  discountPercent: number | null
  status: 'ENABLED' | 'DISABLED'
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  productCount: number
  variationCount: number
}

type SupplierForm = {
  name: string
  accountNumber: string
  discountPercent: string
  status: 'ENABLED' | 'DISABLED'
  contactName: string
  phone: string
  email: string
  address: string
  notes: string
}

const emptyForm: SupplierForm = {
  name: '', accountNumber: '', discountPercent: '', status: 'ENABLED',
  contactName: '', phone: '', email: '', address: '', notes: '',
}

function numOrNull(v: string): number | null {
  return v.trim() === '' ? null : Number(v)
}

export function SuppliersScreen({ label, enabled }: { label: string; enabled: boolean }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loaded, setLoaded] = useState(false)
  const [form, setForm] = useState<SupplierForm | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirm, confirmNode] = useConfirm()
  const [showAlert, alertNode] = useAlert()

  const refresh = useCallback(() => {
    fetch('/api/m/shop/admin/suppliers').then(async (r) => {
      if (r.ok) setSuppliers((await r.json()).suppliers)
      setLoaded(true)
    })
  }, [])
  useEffect(() => { refresh() }, [refresh])

  function startEdit(s?: Supplier) {
    if (s) {
      setEditingId(s.id)
      setForm({
        name: s.name,
        accountNumber: s.accountNumber ?? '',
        discountPercent: s.discountPercent == null ? '' : String(s.discountPercent),
        status: s.status,
        contactName: s.contactName ?? '',
        phone: s.phone ?? '',
        email: s.email ?? '',
        address: s.address ?? '',
        notes: s.notes ?? '',
      })
    } else {
      setEditingId(null)
      setForm(emptyForm)
    }
  }

  async function save() {
    if (!form || saving) return
    setSaving(true)
    try {
      const body = { ...form, discountPercent: numOrNull(form.discountPercent) }
      const url = editingId ? `/api/m/shop/admin/suppliers/${editingId}` : '/api/m/shop/admin/suppliers'
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        await showAlert((await res.json().catch(() => ({}))).error ?? 'Could not save that supplier.', 'Save failed')
        return
      }
      setForm(null)
      setEditingId(null)
      refresh()
    } finally {
      setSaving(false)
    }
  }

  async function remove(s: Supplier) {
    const filed = s.productCount + s.variationCount
    const message = filed === 0
      ? `"${s.name}" will be removed from your supplier list.`
      : `"${s.name}" will be removed from your supplier list. The ${filed === 1 ? 'one item' : `${filed} items`} filed against the name keep it, so adding the supplier back picks them up again.`
    if (!(await confirm({ title: `Delete ${s.name}?`, message }))) return
    await fetch(`/api/m/shop/admin/suppliers/${s.id}`, { method: 'DELETE' })
    refresh()
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">{label === 'Supplier' ? 'Suppliers' : `${label}s`}</h1>
        <button onClick={() => startEdit()} className="btn btn-primary">New {label.toLowerCase()}</button>
      </div>

      {!enabled && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          Supplier support is switched off, so nothing here shows on your products yet. Turn it on under Settings, Shop, General.
        </div>
      )}

      {loaded && suppliers.length === 0 && !form && (
        <p style={{ color: 'var(--color-text-muted)' }}>
          Nobody in the list yet. Add one and it becomes pickable on every product and variation.
        </p>
      )}

      {suppliers.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                <th style={cell}>Name</th>
                <th style={cell}>Account no.</th>
                <th style={cell}>Discount</th>
                <th style={cell}>Contact</th>
                <th style={cell}>Products</th>
                <th style={cell}>Variations</th>
                <th style={cell}>Status</th>
                <th style={cell} />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={cell}>{s.name}</td>
                  <td style={cell}>{s.accountNumber ?? '—'}</td>
                  <td style={cell}>{s.discountPercent == null ? '—' : `${s.discountPercent}%`}</td>
                  <td style={cell}>
                    {s.contactName ?? '—'}
                    {s.email && <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>{s.email}</div>}
                    {s.phone && <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>{s.phone}</div>}
                  </td>
                  <td style={cell}>{s.productCount}</td>
                  <td style={cell}>{s.variationCount}</td>
                  <td style={cell}>{s.status === 'ENABLED' ? 'Enabled' : 'Disabled'}</td>
                  <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                    <button onClick={() => startEdit(s)} style={linkButton}>Edit</button>
                    <button onClick={() => remove(s)} style={{ ...linkButton, marginLeft: '0.75rem', color: 'var(--color-danger)' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="card" style={{ padding: '1rem', marginTop: '1rem', display: 'grid', gap: '0.5rem', maxWidth: 520 }}>
          <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>{editingId ? `Edit ${label.toLowerCase()}` : `New ${label.toLowerCase()}`}</h3>
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} placeholder="e.g. Northern Clay Co." /></label>
          {editingId && (
            <p className="field-hint" style={{ margin: 0 }}>
              Renaming moves every product and variation filed under the old name across with it.
            </p>
          )}
          <label>Account number<input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} style={inputStyle} placeholder="Your account with them" /></label>
          <label>Discount (%)<input type="number" step="0.01" min="0" max="100" value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} style={inputStyle} placeholder="Leave empty for none" /></label>
          <label>
            Status
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as SupplierForm['status'] })} style={inputStyle}>
              <option value="ENABLED">Enabled</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </label>
          <p className="field-hint" style={{ margin: 0 }}>
            Disabled keeps the record and everything filed against it, but drops the name out of the list you pick from.
          </p>
          <label>Contact person<input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} style={inputStyle} /></label>
          <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} /></label>
          <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} /></label>
          <label>Address<textarea rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={inputStyle} /></label>
          <label>Notes<textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={inputStyle} /></label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={save} className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={() => { setForm(null); setEditingId(null) }} className="btn btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {confirmNode}
      {alertNode}
    </div>
  )
}

const cell: React.CSSProperties = { padding: '0.5rem', verticalAlign: 'top' }
const inputStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)', marginTop: '0.25rem' }
const linkButton: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', padding: 0 }
