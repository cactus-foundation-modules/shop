'use client'

import { useEffect, useState, type ComponentType, type CSSProperties, type InputHTMLAttributes } from 'react'
import { getCart } from '@/modules/shop/components/public/cart'
import { EMPTY_ADDRESS, getCheckoutState, updateCheckoutState, type ShpAddressForm } from '@/modules/shop/components/public/checkout-state'
import type { ShopCheckoutAddressLookupProps, ShpLookupAddress } from '@/modules/shop/components/public/checkout-address-lookup'
import { useCartPopulated } from '@/modules/shop/components/public/use-cart-populated'

type ShippingRateOption = { id: string; name: string; estimatedDays: string | null }

// Client island for the checkout shipping step. Registered Puck block wrapper
// (ShopCheckoutShipping) is a server component that renders this, so Puck's RSC
// <Render> never serialises its renderDropZone function bag into the client.
// Blur-time messages for the required fields: specific and fix-stating, never a
// bare "required". Validation runs per field once the shopper leaves it - not
// per keystroke, and never for a field they have not reached yet.
const REQUIRED_MESSAGES: Partial<Record<keyof ShpAddressForm, string>> = {
  firstName: 'Enter your first name.',
  lastName: 'Enter your last name.',
  line1: 'Enter the first line of your address.',
  city: 'Enter your town or city.',
  postcode: 'Enter your postcode.',
}

// The business-name box and whether it is compulsory, from shop settings.
// Fetched here rather than passed down from the RSC wrapper so the editor
// preview draws the same form the storefront does.
type BusinessNameConfig = { enabled: boolean; required: boolean; label: string }

// An address the shopper has ordered to before. Stored fields are all optional
// (the account page's own form asks for fewer than checkout does), so nothing
// here may assume a field is present.
type SavedAddress = { id: string; label: string | null; isDefault: boolean; address: Partial<ShpAddressForm> }

function toAddressForm(a: Partial<ShpAddressForm>): ShpAddressForm {
  return {
    firstName: a.firstName ?? '', lastName: a.lastName ?? '', company: a.company ?? '',
    line1: a.line1 ?? '', line2: a.line2 ?? '', city: a.city ?? '', county: a.county ?? '',
    postcode: a.postcode ?? '', country: a.country || 'GB', phone: a.phone ?? '',
  }
}

// What the shopper reads on the radio. The label they gave it if they gave it
// one - an address saved automatically from an order has none - then whoever it
// goes to, so two addresses in the same house are still tellable apart.
function savedTitle(a: SavedAddress): string {
  const name = [a.address.firstName, a.address.lastName].filter(Boolean).join(' ').trim()
  return a.label?.trim() || name || 'Saved address'
}

function savedSummary(a: SavedAddress): string {
  return [a.address.line1, a.address.city, a.address.postcode].filter(Boolean).join(', ')
}

const OPTION_STYLE: CSSProperties = {
  display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
  border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.5rem 0.75rem',
}

export function CheckoutShippingClient({
  preview = false,
  addressLookup = null,
}: {
  preview?: boolean
  // Resolved server-side from the 'shop.checkout-address-lookup' extension
  // point (see lib/checkout-address-lookup.ts) - null when no provider module
  // is installed, and always null in the editor preview.
  addressLookup?: ComponentType<ShopCheckoutAddressLookupProps> | null
}) {
  const populated = useCartPopulated(preview)
  const initial = getCheckoutState()
  const [address, setAddress] = useState<ShpAddressForm>(initial.shippingAddress)
  const [rates, setRates] = useState<ShippingRateOption[]>([])
  const [selectedRateId, setSelectedRateId] = useState<string | null>(initial.shippingRateId)
  const [touched, setTouched] = useState<Partial<Record<keyof ShpAddressForm, boolean>>>({})
  const [businessName, setBusinessName] = useState<BusinessNameConfig | null>(null)
  // Addresses this shopper has ordered to before. A signed-out shopper gets a
  // 401 and an empty list, which draws nothing - the form below is unchanged
  // for them.
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([])
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null)

  useEffect(() => {
    // No fetch in the editor preview: nobody drawing this block in Puck is a
    // signed-in shopper, so it could only ever draw an empty picker.
    if (preview) return
    let cancelled = false
    fetch('/api/m/shop/member/addresses')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { addresses?: SavedAddress[] } | null) => {
        const list = d?.addresses ?? []
        if (cancelled || list.length === 0) return
        setSavedAddresses(list)
        // Only fill the form from the book when there is nothing in it to lose.
        // A shopper who has already typed an address, or who has stepped back to
        // this block mid-checkout, keeps what they have.
        if (getCheckoutState().shippingAddress.line1.trim().length > 0) return
        const preferred = list.find((a) => a.isDefault) ?? list[0]
        if (!preferred) return
        const form = toAddressForm(preferred.address)
        setAddress(form)
        setSelectedSavedId(preferred.id)
        updateCheckoutState({ shippingAddress: form })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [preview])

  useEffect(() => {
    let cancelled = false
    fetch('/api/m/shop/public/config')
      .then((r) => r.json())
      .then((d: { businessName?: BusinessNameConfig }) => { if (!cancelled && d.businessName) setBusinessName(d.businessName) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  function set<K extends keyof ShpAddressForm>(key: K, value: ShpAddressForm[K]) {
    const next = { ...address, [key]: value }
    setAddress(next)
    updateCheckoutState({ shippingAddress: next })
    // Typing over a picked address means this is no longer that address. The
    // radio moves to "a different address" rather than leaving a saved entry
    // ticked next to fields that no longer match it - and the shopper's edits
    // stay put, since nothing in their address book is being changed here.
    setSelectedSavedId(null)
  }

  function chooseSaved(saved: SavedAddress) {
    const form = toAddressForm(saved.address)
    setAddress(form)
    setSelectedSavedId(saved.id)
    updateCheckoutState({ shippingAddress: form })
    // Errors raised against the address being replaced are not errors in this
    // one, so the blur-time messages start again from clean.
    setTouched({})
  }

  function chooseNew() {
    setAddress(EMPTY_ADDRESS)
    setSelectedSavedId(null)
    updateCheckoutState({ shippingAddress: EMPTY_ADDRESS })
    setTouched({})
  }

  function fieldError(key: keyof ShpAddressForm): string | null {
    // The business name's message is built from the owner's own label, so it
    // can't live in the fixed map above - "Enter your delivery depot." reads
    // properly, "Enter your business name." would be a lie on that shop.
    const message = key === 'company' && businessName?.required
      ? `Enter your ${businessName.label.trim().toLowerCase() || 'business name'}.`
      : REQUIRED_MESSAGES[key]
    if (!message || !touched[key]) return null
    return address[key].trim().length === 0 ? message : null
  }

  useEffect(() => {
    if (!address.postcode || address.postcode.length < 3) return
    const lines = getCart()
    if (lines.length === 0) return

    const timeout = setTimeout(async () => {
      const res = await fetch('/api/m/shop/public/checkout/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines, postcode: address.postcode, shippingRateId: selectedRateId }),
      })
      if (!res.ok) return
      const data = await res.json()
      const newRates: ShippingRateOption[] = data.shippingRates ?? []
      setRates(newRates)
      // If the postcode changed to a different zone, the previously selected
      // rate may no longer be offered - drop it and fall back to the first
      // available (or none) so we never carry a rate from the wrong zone.
      const stillValid = selectedRateId != null && newRates.some((r) => r.id === selectedRateId)
      if (!stillValid) {
        const fallback = newRates[0]?.id ?? null
        setSelectedRateId(fallback)
        updateCheckoutState({ shippingRateId: fallback })
      }
    }, 500)
    return () => clearTimeout(timeout)
    // Deliberately postcode-only: re-running on every selectedRateId change would
    // reset the debounce each time a shopper picks a rate. The callback reads the
    // latest selectedRateId via closure instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address.postcode])

  // A picked suggestion lands as one state update, not four set() calls that
  // would each clobber the previous one's spread of a stale `address`.
  function applyLookup(picked: ShpLookupAddress) {
    const next = { ...address, line1: picked.line1, line2: picked.line2, city: picked.city, county: picked.county, postcode: picked.postcode }
    setAddress(next)
    updateCheckoutState({ shippingAddress: next })
    setSelectedSavedId(null)
  }

  // Real <label>s, not placeholder-as-label: a placeholder vanishes the moment
  // typing starts and never reaches a screen reader as the field's name.
  // `extra` lets an address-lookup provider layer combobox behaviour onto the
  // input while this component keeps sole ownership of the markup; shop's own
  // handlers run first, then the provider's.
  function field(key: keyof ShpAddressForm, label: string, autoComplete: string, required: boolean, extra?: InputHTMLAttributes<HTMLInputElement>) {
    const error = fieldError(key)
    return (
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        <span>{label}</span>
        <input
          {...extra}
          type="text"
          required={required}
          autoComplete={extra?.autoComplete ?? autoComplete}
          value={address[key]}
          onChange={(e) => { set(key, e.target.value); extra?.onChange?.(e) }}
          onBlur={(e) => { setTouched((t) => ({ ...t, [key]: true })); extra?.onBlur?.(e) }}
          aria-invalid={error ? true : undefined}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: `1px solid ${error ? 'var(--color-danger)' : 'var(--color-border)'}`, ...extra?.style }}
        />
        {error && <span role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.8125rem' }}>{error}</span>}
      </label>
    )
  }

  const AddressLookup = addressLookup

  // Empty basket: no order to deliver, so no address to ask for - the
  // order-summary block carries the empty message.
  if (!populated) return null

  return (
    <section style={{ display: 'grid', gap: '0.75rem', maxWidth: 480 }}>
      <h2 style={{ fontSize: '1.125rem', margin: 0 }}>Delivery address</h2>

      {/* Only drawn for a signed-in shopper who has an address book with
          something in it. The fields below stay visible either way, so a picked
          address can still be corrected before the order goes in. */}
      {savedAddresses.length > 0 && (
        <fieldset style={{ display: 'grid', gap: '0.5rem', border: 0, margin: 0, padding: 0 }}>
          <legend style={{ fontSize: '0.9375rem', fontWeight: 'var(--font-medium)', padding: 0, marginBottom: '0.25rem' }}>Deliver to</legend>
          {savedAddresses.map((saved) => (
            <label key={saved.id} style={OPTION_STYLE}>
              <input
                type="radio"
                name="savedAddress"
                checked={selectedSavedId === saved.id}
                onChange={() => chooseSaved(saved)}
                style={{ marginTop: '0.2rem' }}
              />
              <span>
                <span style={{ display: 'block', fontWeight: 'var(--font-medium)' }}>{savedTitle(saved)}</span>
                <span style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>{savedSummary(saved)}</span>
              </span>
            </label>
          ))}
          <label style={OPTION_STYLE}>
            <input
              type="radio"
              name="savedAddress"
              checked={selectedSavedId === null}
              onChange={chooseNew}
              style={{ marginTop: '0.2rem' }}
            />
            <span>Use a different address</span>
          </label>
        </fieldset>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {field('firstName', 'First name', 'given-name', true)}
        {field('lastName', 'Last name', 'family-name', true)}
      </div>
      {/* Above line 1, which is where a business address puts it and where the
          browser's own autofill expects to find it. Optional by default, so the
          label says so out loud rather than leaving a shopper wondering whether
          a blank box will stop them. */}
      {businessName?.enabled && field(
        'company',
        businessName.required ? businessName.label : `${businessName.label} (optional)`,
        'organization',
        businessName.required,
      )}
      {AddressLookup ? (
        <AddressLookup
          value={address.line1}
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

      {rates.length > 0 && (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <h3 style={{ fontSize: '0.9375rem', margin: 0 }}>Delivery method</h3>
          {rates.map((rate) => (
            <label key={rate.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
              <input type="radio" name="shippingRate" checked={selectedRateId === rate.id} onChange={() => { setSelectedRateId(rate.id); updateCheckoutState({ shippingRateId: rate.id }) }} />
              <span>{rate.name}{rate.estimatedDays ? ` - ${rate.estimatedDays}` : ''}</span>
            </label>
          ))}
        </div>
      )}
    </section>
  )
}
