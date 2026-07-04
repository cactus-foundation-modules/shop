'use client'

import { useEffect, useState } from 'react'
import { EMPTY_ADDRESS, type ShpAddressForm } from '@/modules/shop/components/public/checkout-state'

type SavedAddress = { id: string; label: string | null; isDefault: boolean; address: ShpAddressForm }

export function AddressesClient() {
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [form, setForm] = useState<ShpAddressForm>(EMPTY_ADDRESS)
  const [label, setLabel] = useState('')

  function refresh() {
    fetch('/api/m/shop/member/addresses').then(async (r) => { if (r.ok) setAddresses((await r.json()).addresses) })
  }

  useEffect(refresh, [])

  async function addAddress() {
    await fetch('/api/m/shop/member/addresses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: label || null, address: form }) })
    setForm(EMPTY_ADDRESS)
    setLabel('')
    refresh()
  }

  async function deleteAddress(id: string) {
    await fetch(`/api/m/shop/member/addresses/${id}`, { method: 'DELETE' })
    refresh()
  }

  return (
    <div style={{ display: 'grid', gap: '1.5rem', maxWidth: 480 }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
        {addresses.map((a) => (
          <li key={a.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem 1rem' }}>
            <div style={{ fontWeight: 600 }}>{a.label || 'Address'}{a.isDefault && ' (default)'}</div>
            <div>{a.address.line1}, {a.address.city}, {a.address.postcode}</div>
            <button onClick={() => deleteAddress(a.id)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0, marginTop: '0.5rem' }}>Delete</button>
          </li>
        ))}
      </ul>

      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1.125rem', margin: 0 }}>Add address</h2>
        <input placeholder="Label (e.g. Home)" value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} />
        <input placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} style={inputStyle} />
        <input placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} style={inputStyle} />
        <input placeholder="Address line 1" value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} style={inputStyle} />
        <input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} style={inputStyle} />
        <input placeholder="Postcode" value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} style={inputStyle} />
        <button onClick={addAddress} style={{ background: 'var(--color-primary)', color: 'var(--color-primary-contrast, #fff)', border: 'none', borderRadius: 8, padding: '0.625rem 1.25rem', fontWeight: 600, cursor: 'pointer', justifySelf: 'start' }}>
          Save address
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }
