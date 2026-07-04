'use client'

import { useState } from 'react'
import { getCheckoutState, updateCheckoutState } from '@/modules/shop/components/public/checkout-state'

// [ANCHOR] - core checkout step, non-removable core fields (email/name).
export type ShopCheckoutContactProps = Record<string, never>

function ContactForm() {
  const initial = getCheckoutState()
  const [email, setEmail] = useState(initial.customerEmail)
  const [name, setName] = useState(initial.customerName)
  const [phone, setPhone] = useState(initial.customerPhone)

  return (
    <section style={{ display: 'grid', gap: '0.75rem', maxWidth: 480 }}>
      <h2 style={{ fontSize: '1.125rem', margin: 0 }}>Contact details</h2>
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        <span>Email</span>
        <input type="email" required value={email} onChange={(e) => { setEmail(e.target.value); updateCheckoutState({ customerEmail: e.target.value }) }}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
      </label>
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        <span>Full name</span>
        <input type="text" required value={name} onChange={(e) => { setName(e.target.value); updateCheckoutState({ customerName: e.target.value }) }}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
      </label>
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        <span>Phone (optional)</span>
        <input type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); updateCheckoutState({ customerPhone: e.target.value }) }}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
      </label>
    </section>
  )
}

export function ShopCheckoutContact() {
  return <ContactForm />
}

export const shopCheckoutContactPuckComponent = {
  label: 'Shop: Checkout - Contact [Anchor]',
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: ShopCheckoutContact,
}

export const shopCheckoutContactPuckRscComponent = shopCheckoutContactPuckComponent
