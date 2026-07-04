'use client'

import { useEffect, useState } from 'react'
import { getCart } from '@/modules/shop/components/public/cart'
import { getCheckoutState, updateCheckoutState, type ShpAddressForm } from '@/modules/shop/components/public/checkout-state'

// [ANCHOR] - core checkout step (shipping address + method).
export type ShopCheckoutShippingProps = Record<string, never>

type ShippingRateOption = { id: string; name: string; estimatedDays: string | null }

function ShippingForm() {
  const initial = getCheckoutState()
  const [address, setAddress] = useState<ShpAddressForm>(initial.shippingAddress)
  const [rates, setRates] = useState<ShippingRateOption[]>([])
  const [selectedRateId, setSelectedRateId] = useState<string | null>(initial.shippingRateId)

  function set<K extends keyof ShpAddressForm>(key: K, value: ShpAddressForm[K]) {
    const next = { ...address, [key]: value }
    setAddress(next)
    updateCheckoutState({ shippingAddress: next })
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
      setRates(data.shippingRates ?? [])
      if (!selectedRateId && data.shippingRates?.[0]) {
        setSelectedRateId(data.shippingRates[0].id)
        updateCheckoutState({ shippingRateId: data.shippingRates[0].id })
      }
    }, 500)
    return () => clearTimeout(timeout)
    // Deliberately postcode-only: re-running on every selectedRateId change would
    // reset the debounce each time a shopper picks a rate. The callback reads the
    // latest selectedRateId via closure instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address.postcode])

  return (
    <section style={{ display: 'grid', gap: '0.75rem', maxWidth: 480 }}>
      <h2 style={{ fontSize: '1.125rem', margin: 0 }}>Shipping address</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <input placeholder="First name" required value={address.firstName} onChange={(e) => set('firstName', e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
        <input placeholder="Last name" required value={address.lastName} onChange={(e) => set('lastName', e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
      </div>
      <input placeholder="Address line 1" required value={address.line1} onChange={(e) => set('line1', e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
      <input placeholder="Address line 2 (optional)" value={address.line2} onChange={(e) => set('line2', e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <input placeholder="City" required value={address.city} onChange={(e) => set('city', e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
        <input placeholder="Postcode" required value={address.postcode} onChange={(e) => set('postcode', e.target.value)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
      </div>

      {rates.length > 0 && (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <h3 style={{ fontSize: '0.9375rem', margin: 0 }}>Shipping method</h3>
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

export function ShopCheckoutShipping() {
  return <ShippingForm />
}

export const shopCheckoutShippingPuckComponent = {
  label: 'Shop: Checkout - Shipping [Anchor]',
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: ShopCheckoutShipping,
}

export const shopCheckoutShippingPuckRscComponent = shopCheckoutShippingPuckComponent
