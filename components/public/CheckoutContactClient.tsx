'use client'

import { useState } from 'react'
import { getCheckoutState, updateCheckoutState } from '@/modules/shop/components/public/checkout-state'

// Client island for the checkout contact step. Registered Puck block wrapper
// (ShopCheckoutContact) is a server component that renders this, so Puck's RSC
// <Render> never serialises its renderDropZone function bag into the client.
export function CheckoutContactClient() {
  const initial = getCheckoutState()
  const [email, setEmail] = useState(initial.customerEmail)
  const [name, setName] = useState(initial.customerName)
  const [phone, setPhone] = useState(initial.customerPhone)

  return (
    <section style={{ display: 'grid', gap: '0.75rem', maxWidth: 480 }}>
      <h2 style={{ fontSize: '1.125rem', margin: 0 }}>Contact details</h2>
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        <span>Email</span>
        <input type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => { setEmail(e.target.value); updateCheckoutState({ customerEmail: e.target.value }) }}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Your order confirmation goes here.</span>
      </label>
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        <span>Full name</span>
        <input type="text" required autoComplete="name" value={name} onChange={(e) => { setName(e.target.value); updateCheckoutState({ customerName: e.target.value }) }}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
      </label>
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        <span>Phone (optional)</span>
        <input type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); updateCheckoutState({ customerPhone: e.target.value }) }}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Only used if there is a problem with your delivery.</span>
      </label>
    </section>
  )
}
