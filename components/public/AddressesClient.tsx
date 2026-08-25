'use client'

import { useEffect, useState, type ComponentType, type CSSProperties, type InputHTMLAttributes } from 'react'
import { EMPTY_ADDRESS, type ShpAddressForm } from '@/modules/shop/components/public/checkout-state'
import type { ShopCheckoutAddressLookupProps, ShpLookupAddress } from '@/modules/shop/components/public/checkout-address-lookup'
import { formatUkPhone, isValidUkPhone, UK_PHONE_MESSAGE } from '@/modules/shop/lib/phone'
import { fetchShopPublicConfig } from '@/modules/shop/lib/public-config-client'

// Stored addresses are all-optional (older rows were filed from orders, and the
// account form used to ask for fewer fields than checkout does), so nothing here
// may assume a field is present.
type SavedAddress = { id: string; label: string | null; isDefault: boolean; address: Partial<ShpAddressForm> }

function toAddressForm(a: Partial<ShpAddressForm>): ShpAddressForm {
  return {
    firstName: a.firstName ?? '', lastName: a.lastName ?? '',
    line1: a.line1 ?? '', line2: a.line2 ?? '', city: a.city ?? '', county: a.county ?? '',
    postcode: a.postcode ?? '', country: a.country || 'GB', phone: a.phone ?? '',
  }
}

// An address kept from an order has no label - nobody was asked for one - so it
// falls back to whoever it goes to. "Address, Address, Address" down a list of
// three is no help to anyone deciding which to delete.
function addressTitle(a: SavedAddress): string {
  const name = [a.address.firstName, a.address.lastName].filter(Boolean).join(' ').trim()
  return a.label?.trim() || name || 'Address'
}

// Blur-time messages for the required fields: specific and fix-stating, never a
// bare "required". Word for word what checkout says, because a shopper filling
// this in has quite likely just filled the other one in.
const REQUIRED_MESSAGES: Partial<Record<keyof ShpAddressForm, string>> = {
  firstName: 'Enter the first name.',
  lastName: 'Enter the last name.',
  line1: 'Enter the first line of the address.',
  city: 'Enter the town or city.',
  postcode: 'Enter the postcode.',
}

export function AddressesClient({ addressLookup = null }: {
  // Resolved server-side from the 'shop.checkout-address-lookup' extension
  // point - null when no provider module is installed. Same provider, same
  // behaviour: an address typed here is worth no less than one typed at
  // checkout, so it gets the same help finding itself.
  addressLookup?: ComponentType<ShopCheckoutAddressLookupProps> | null
}) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [loaded, setLoaded] = useState(false)
  // Which address is open in the editor, or 'new' for the add form. One at a
  // time: two open forms is two half-typed addresses and no way to tell which
  // one the Save button belongs to.
  const [editing, setEditing] = useState<string | null>(null)
  // Assumed optional until the answer arrives: labelling a box compulsory and
  // then relenting is the worse of the two wrong guesses.
  const [phoneRequired, setPhoneRequired] = useState(false)

  function refresh() {
    fetch('/api/m/shop/member/addresses').then(async (r) => {
      // 204 is a signed-out browser and carries no body, so it has to be turned
      // away here: json() on it throws, and this call has nothing to catch it.
      if (!r.ok || r.status === 204) return
      setAddresses((await r.json()).addresses)
      setLoaded(true)
    })
  }

  useEffect(refresh, [])

  useEffect(() => {
    let cancelled = false
    fetchShopPublicConfig<{ requirePhone?: boolean }>()
      .then((d) => {
        if (cancelled || !d) return
        setPhoneRequired(d.requirePhone === true)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  async function saveAddress(id: string | null, label: string, address: ShpAddressForm): Promise<string | null> {
    const url = id ? `/api/m/shop/member/addresses/${id}` : '/api/m/shop/member/addresses'
    const res = await fetch(url, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The whole address goes back on an edit, not the changed field: the
      // endpoint replaces the stored object, so sending one field on its own
      // would empty the door it belongs to.
      body: JSON.stringify({ label: label.trim() || null, address }),
    })
    if (!res.ok) {
      const message = await res.json().then((d: { error?: string }) => d.error).catch(() => null)
      return message || 'That address could not be saved. Please try again.'
    }
    setEditing(null)
    refresh()
    return null
  }

  async function deleteAddress(id: string) {
    await fetch(`/api/m/shop/member/addresses/${id}`, { method: 'DELETE' })
    if (editing === id) setEditing(null)
    refresh()
  }

  return (
    <div style={{ display: 'grid', gap: '1.5rem', maxWidth: 480 }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
        {addresses.map((a) => (
          <li key={a.id} style={CARD_STYLE}>
            {editing === a.id ? (
              <AddressForm
                // Keyed on the row so switching straight from one address to
                // another starts the form again rather than leaving the first
                // one's typing behind in the second one's boxes.
                key={a.id}
                heading="Edit address"
                initialLabel={a.label ?? ''}
                initialAddress={toAddressForm(a.address)}
                addressLookup={addressLookup}
                phoneRequired={phoneRequired}
                onCancel={() => setEditing(null)}
                onSave={(label, address) => saveAddress(a.id, label, address)}
              />
            ) : (
              <>
                <div style={{ fontWeight: 600 }}>{addressTitle(a)}{a.isDefault && ' (default)'}</div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>
                  {[a.address.line1, a.address.line2, a.address.city, a.address.county, a.address.postcode]
                    .filter((part) => (part ?? '').trim().length > 0)
                    .join(', ')}
                </div>
                {/* One number per address: it is how a courier reaches whoever
                    is at this particular door, which is not necessarily the
                    person who placed the order. */}
                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem' }}>
                  {(a.address.phone ?? '').trim() || 'No phone number for this address'}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                  <button onClick={() => setEditing(a.id)} style={SECONDARY_BUTTON_STYLE}>Edit</button>
                  <button onClick={() => deleteAddress(a.id)} style={LINK_BUTTON_STYLE}>Delete</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {loaded && addresses.length === 0 && editing !== 'new' && (
        <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
          Nothing in your address book yet. Add one here, or let checkout file the next one you order to.
        </p>
      )}

      {editing === 'new' ? (
        <div style={CARD_STYLE}>
          <AddressForm
            heading="Add address"
            initialLabel=""
            initialAddress={EMPTY_ADDRESS}
            addressLookup={addressLookup}
            phoneRequired={phoneRequired}
            onCancel={() => setEditing(null)}
            onSave={(label, address) => saveAddress(null, label, address)}
          />
        </div>
      ) : (
        <button onClick={() => setEditing('new')} style={{ ...PRIMARY_BUTTON_STYLE, justifySelf: 'start' }}>
          Add address
        </button>
      )}
    </div>
  )
}

function AddressForm({
  heading, initialLabel, initialAddress, addressLookup, phoneRequired, onCancel, onSave,
}: {
  heading: string
  initialLabel: string
  initialAddress: ShpAddressForm
  addressLookup: ComponentType<ShopCheckoutAddressLookupProps> | null
  phoneRequired: boolean
  onCancel: () => void
  onSave: (label: string, address: ShpAddressForm) => Promise<string | null>
}) {
  const [label, setLabel] = useState(initialLabel)
  const [form, setForm] = useState<ShpAddressForm>(initialAddress)
  const [touched, setTouched] = useState<Partial<Record<keyof ShpAddressForm, boolean>>>({})
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set<K extends keyof ShpAddressForm>(key: K, value: ShpAddressForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // A picked suggestion lands as one state update, not five set() calls that
  // would each clobber the previous one's spread of a stale form.
  function applyLookup(picked: ShpLookupAddress) {
    setForm((f) => ({ ...f, line1: picked.line1, line2: picked.line2, city: picked.city, county: picked.county, postcode: picked.postcode }))
  }

  function fieldError(key: keyof ShpAddressForm): string | null {
    const message = REQUIRED_MESSAGES[key]
    if (!message || !touched[key]) return null
    return form[key].trim().length === 0 ? message : null
  }

  // Real <label>s, not placeholder-as-label: a placeholder vanishes the moment
  // typing starts and never reaches a screen reader as the field's name.
  // `extra` lets the address-lookup provider layer combobox behaviour onto the
  // input while this form keeps sole ownership of the markup; the form's own
  // handlers run first, then the provider's.
  function field(key: keyof ShpAddressForm, fieldLabel: string, autoComplete: string, required: boolean, extra?: InputHTMLAttributes<HTMLInputElement>) {
    const err = fieldError(key)
    return (
      // alignContent start, not the default stretch: two of these sit side by
      // side in a 1fr 1fr row, and a message under one of them makes that row
      // taller. Stretched auto rows would spend the extra height on the other
      // box, so the pair drift out of line the moment one is told off.
      <label style={{ display: 'grid', gap: '0.25rem', alignContent: 'start' }}>
        <span>{fieldLabel}</span>
        <input
          {...extra}
          type="text"
          required={required}
          autoComplete={extra?.autoComplete ?? autoComplete}
          value={form[key]}
          onChange={(e) => { set(key, e.target.value); extra?.onChange?.(e) }}
          onBlur={(e) => { setTouched((t) => ({ ...t, [key]: true })); extra?.onBlur?.(e) }}
          aria-invalid={err ? true : undefined}
          style={{ ...INPUT_STYLE, borderColor: err ? 'var(--color-danger)' : 'var(--color-border)', ...extra?.style }}
        />
        {err && <span role="alert" style={ERROR_STYLE}>{err}</span>}
      </label>
    )
  }

  const typedPhone = form.phone.trim()
  const phoneError = !phoneTouched
    ? null
    : typedPhone.length === 0
      ? (phoneRequired ? 'Enter a phone number.' : null)
      : isValidUkPhone(typedPhone) ? null : UK_PHONE_MESSAGE

  async function submit() {
    // Everything gets marked touched first, so a shopper who reaches straight
    // for Save is told which box is short rather than nothing happening.
    const required: Array<keyof ShpAddressForm> = ['firstName', 'lastName', 'line1', 'city', 'postcode']
    setTouched(Object.fromEntries(required.map((k) => [k, true])))
    setPhoneTouched(true)

    const missing = required.some((k) => form[k].trim().length === 0)
    // A number nobody can ring is worse than no number: the checkout refuses one
    // outright, so the address book does not quietly keep one either.
    const badPhone = typedPhone.length === 0 ? phoneRequired : !isValidUkPhone(typedPhone)
    if (missing || badPhone) {
      setError('')
      return
    }

    setSaving(true)
    try {
      const message = await onSave(label, { ...form, phone: formatUkPhone(typedPhone) ?? typedPhone })
      setError(message ?? '')
    } finally {
      setSaving(false)
    }
  }

  const AddressLookup = addressLookup

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      <h2 style={{ fontSize: '1.125rem', margin: 0 }}>{heading}</h2>
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        <span>Label (optional)</span>
        <input placeholder="e.g. Head office" value={label} onChange={(e) => setLabel(e.target.value)} style={INPUT_STYLE} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {field('firstName', 'First name', 'given-name', true)}
        {field('lastName', 'Last name', 'family-name', true)}
      </div>
      {/* Under the names: the number belongs to
          whoever is at this door rather than to the account, which is why it is
          kept with the address and not on the member's own details. */}
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        <span>{phoneRequired ? 'Phone' : 'Phone (optional)'}</span>
        <input
          type="tel"
          required={phoneRequired}
          autoComplete="tel"
          inputMode="tel"
          value={form.phone}
          onChange={(e) => { setPhoneTouched(true); set('phone', e.target.value) }}
          // Tidied to canonical form on the way out, so what the shopper reads
          // back is what an order to this door will carry. Left exactly as typed
          // when it is not a number we can read - rewriting a wrong number would
          // hide the very thing the message underneath complains of.
          onBlur={() => {
            setPhoneTouched(true)
            const tidied = formatUkPhone(form.phone)
            if (tidied && tidied !== form.phone) set('phone', tidied)
          }}
          aria-invalid={phoneError ? true : undefined}
          style={{ ...INPUT_STYLE, borderColor: phoneError ? 'var(--color-danger)' : 'var(--color-border)' }}
        />
        {phoneError && <span role="alert" style={ERROR_STYLE}>{phoneError}</span>}
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
          Only ever used about a delivery to this address - a slot, or a question on the day.
        </span>
      </label>
      {AddressLookup ? (
        <AddressLookup
          value={form.line1}
          onSelect={applyLookup}
          renderInput={(inputProps) => field('line1', 'Address line 1', 'address-line1', true, inputProps)}
        />
      ) : (
        field('line1', 'Address line 1', 'address-line1', true)
      )}
      {field('line2', 'Address line 2 (optional)', 'address-line2', false)}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {field('city', 'Town or city', 'address-level2', true)}
        {field('postcode', 'Postcode', 'postal-code', true)}
      </div>
      {error && <span role="alert" style={ERROR_STYLE}>{error}</span>}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
        <button onClick={submit} disabled={saving} style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving ? 0.6 : 1, cursor: saving ? 'default' : 'pointer' }}>
          {saving ? 'Saving…' : 'Save address'}
        </button>
        <button onClick={onCancel} disabled={saving} style={SECONDARY_BUTTON_STYLE}>Cancel</button>
      </div>
    </div>
  )
}

const CARD_STYLE: CSSProperties = { border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem 1rem' }
const INPUT_STYLE: CSSProperties = { padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }
const ERROR_STYLE: CSSProperties = { color: 'var(--color-danger)', fontSize: '0.8125rem' }
const PRIMARY_BUTTON_STYLE: CSSProperties = {
  background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 8,
  padding: '0.625rem 1.25rem', fontWeight: 600, cursor: 'pointer',
}
const SECONDARY_BUTTON_STYLE: CSSProperties = {
  background: 'none', border: '1px solid var(--color-border)', borderRadius: 6,
  padding: '0.5rem 0.75rem', color: 'var(--color-text)', cursor: 'pointer',
}
const LINK_BUTTON_STYLE: CSSProperties = {
  background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '0.5rem 0',
}
