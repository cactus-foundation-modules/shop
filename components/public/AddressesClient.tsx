'use client'

import { useEffect, useState } from 'react'
import { EMPTY_ADDRESS, type ShpAddressForm } from '@/modules/shop/components/public/checkout-state'
import { formatUkPhone, isValidUkPhone, UK_PHONE_MESSAGE } from '@/modules/shop/lib/phone'

type SavedAddress = { id: string; label: string | null; isDefault: boolean; address: ShpAddressForm }

// An address kept from an order has no label - nobody was asked for one - so it
// falls back to whoever it goes to. "Address, Address, Address" down a list of
// three is no help to anyone deciding which to delete.
function addressTitle(a: SavedAddress): string {
  const name = [a.address.firstName, a.address.lastName].filter(Boolean).join(' ').trim()
  return a.label?.trim() || name || 'Address'
}

export function AddressesClient() {
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [form, setForm] = useState<ShpAddressForm>(EMPTY_ADDRESS)
  const [label, setLabel] = useState('')
  const [addError, setAddError] = useState('')
  // Phone edits in progress, keyed by address id: the box only leaves the list's
  // own copy behind once a save has actually landed.
  const [phoneEdits, setPhoneEdits] = useState<Record<string, string>>({})
  const [phoneErrors, setPhoneErrors] = useState<Record<string, string>>({})
  const [savingPhone, setSavingPhone] = useState<string | null>(null)

  function refresh() {
    fetch('/api/m/shop/member/addresses').then(async (r) => {
      if (!r.ok) return
      setAddresses((await r.json()).addresses)
      setPhoneEdits({})
    })
  }

  useEffect(refresh, [])

  async function addAddress() {
    // A number nobody can ring is worse than no number: the checkout refuses one
    // outright, so the address book does not quietly keep one either.
    const typed = form.phone.trim()
    if (typed.length > 0 && !isValidUkPhone(typed)) {
      setAddError(UK_PHONE_MESSAGE)
      return
    }
    setAddError('')
    await fetch('/api/m/shop/member/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label || null, address: { ...form, phone: formatUkPhone(typed) ?? typed } }),
    })
    setForm(EMPTY_ADDRESS)
    setLabel('')
    refresh()
  }

  async function savePhone(a: SavedAddress) {
    const typed = (phoneEdits[a.id] ?? a.address.phone ?? '').trim()
    if (typed.length > 0 && !isValidUkPhone(typed)) {
      setPhoneErrors((e) => ({ ...e, [a.id]: UK_PHONE_MESSAGE }))
      return
    }
    setPhoneErrors((e) => ({ ...e, [a.id]: '' }))
    setSavingPhone(a.id)
    try {
      // The whole address goes back, not just the number: the endpoint replaces
      // the stored object, so sending the number on its own would empty the
      // door it belongs to.
      await fetch(`/api/m/shop/member/addresses/${a.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: { ...a.address, phone: formatUkPhone(typed) ?? typed } }),
      })
      refresh()
    } finally {
      setSavingPhone(null)
    }
  }

  async function deleteAddress(id: string) {
    await fetch(`/api/m/shop/member/addresses/${id}`, { method: 'DELETE' })
    refresh()
  }

  return (
    <div style={{ display: 'grid', gap: '1.5rem', maxWidth: 480 }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
        {addresses.map((a) => {
          const value = phoneEdits[a.id] ?? a.address.phone ?? ''
          const error = phoneErrors[a.id]
          const dirty = value.trim() !== (a.address.phone ?? '').trim()
          return (
            <li key={a.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem 1rem' }}>
              <div style={{ fontWeight: 600 }}>{addressTitle(a)}{a.isDefault && ' (default)'}</div>
              <div>{a.address.line1}, {a.address.city}, {a.address.postcode}</div>
              {/* One number per address, changeable here: it is how a courier
                  reaches whoever is at this particular door, which is not
                  necessarily the person who placed the order. */}
              <label style={{ display: 'grid', gap: '0.25rem', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Phone number for this address</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={value}
                    onChange={(e) => setPhoneEdits((p) => ({ ...p, [a.id]: e.target.value }))}
                    aria-invalid={error ? true : undefined}
                    style={{ ...inputStyle, flex: 1, borderColor: error ? 'var(--color-danger)' : 'var(--color-border)' }}
                  />
                  <button
                    onClick={() => savePhone(a)}
                    disabled={!dirty || savingPhone === a.id}
                    style={{
                      background: 'none', border: '1px solid var(--color-border)', borderRadius: 6,
                      padding: '0.5rem 0.75rem', color: 'var(--color-text)',
                      cursor: !dirty || savingPhone === a.id ? 'default' : 'pointer',
                      opacity: !dirty || savingPhone === a.id ? 0.6 : 1,
                    }}
                  >
                    {savingPhone === a.id ? 'Saving…' : 'Save'}
                  </button>
                </div>
                {error && <span role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.8125rem' }}>{error}</span>}
              </label>
              <button onClick={() => deleteAddress(a.id)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0, marginTop: '0.5rem' }}>Delete</button>
            </li>
          )
        })}
      </ul>

      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1.125rem', margin: 0 }}>Add address</h2>
        <input placeholder="Label (e.g. Home)" value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} />
        <input placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} style={inputStyle} />
        <input placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} style={inputStyle} />
        <input placeholder="Phone number (optional)" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
        <input placeholder="Address line 1" value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} style={inputStyle} />
        <input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} style={inputStyle} />
        <input placeholder="Postcode" value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} style={inputStyle} />
        {addError && <span role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.8125rem' }}>{addError}</span>}
        <button onClick={addAddress} style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 8, padding: '0.625rem 1.25rem', fontWeight: 600, cursor: 'pointer', justifySelf: 'start' }}>
          Save address
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }
