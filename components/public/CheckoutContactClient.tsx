'use client'

import { useEffect, useState } from 'react'
import { getCheckoutState, updateCheckoutState } from '@/modules/shop/components/public/checkout-state'
import { useCartPopulated } from '@/modules/shop/components/public/use-cart-populated'

// Client island for the checkout contact step. Registered Puck block wrapper
// (ShopCheckoutContact) is a server component that renders this, so Puck's RSC
// <Render> never serialises its renderDropZone function bag into the client.
//
// Email and name only. The phone number moved to the delivery step, under the
// names it belongs with: a number is how a courier reaches whoever is at that
// door, which is not always the person paying, so it travels with the address
// rather than with the account.
export function CheckoutContactClient({ preview = false, heading }: { preview?: boolean; heading?: string }) {
  const populated = useCartPopulated(preview)
  const initial = getCheckoutState()
  const [email, setEmail] = useState(initial.customerEmail)
  const [name, setName] = useState(initial.customerName)

  // The name the shopper keeps on their account, if they are signed in and have
  // filled it in. A signed-out shopper gets a 401 and nothing changes.
  //
  // Only ever fills a box that is empty: somebody who has typed a different name
  // for this one order, or who has stepped back to this block mid-checkout,
  // keeps what they typed. Nothing is written back to the account from here -
  // ordering something in a colleague's name is not a change of account details.
  useEffect(() => {
    // Nobody drawing this block in the Puck editor is a signed-in shopper.
    if (preview) return
    let cancelled = false
    fetch('/api/members/contact')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { fullName?: string | null } | null) => {
        if (cancelled || !d?.fullName) return
        if (getCheckoutState().customerName.trim().length > 0) return
        setName(d.fullName)
        updateCheckoutState({ customerName: d.fullName })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [preview])

  // Empty basket: the order-summary block owns the "your basket is empty"
  // message; a contact form under it would suggest there is still an order to
  // place.
  if (!populated) return null

  return (
    <section style={{ display: 'grid', gap: '0.75rem', maxWidth: 480 }}>
      <h2 style={{ fontSize: '1.125rem', margin: 0 }}>{heading || 'Contact details'}</h2>
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        <span>Email</span>
        {/* data-shop-field is how the review step finds this box when it lists
            what is still outstanding - see focusCheckoutField. */}
        <input type="email" required autoComplete="email" inputMode="email" data-shop-field="customerEmail" value={email} onChange={(e) => { setEmail(e.target.value); updateCheckoutState({ customerEmail: e.target.value }) }}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Your order confirmation goes here.</span>
      </label>
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        <span>Full name</span>
        <input type="text" required autoComplete="name" data-shop-field="customerName" value={name} onChange={(e) => { setName(e.target.value); updateCheckoutState({ customerName: e.target.value }) }}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
      </label>
    </section>
  )
}
