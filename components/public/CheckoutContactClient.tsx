'use client'

import { useEffect, useState } from 'react'
import { getCheckoutState, updateCheckoutState } from '@/modules/shop/components/public/checkout-state'
import { formatUkPhone, isValidUkPhone, UK_PHONE_MESSAGE } from '@/modules/shop/lib/phone'
import { useCartPopulated } from '@/modules/shop/components/public/use-cart-populated'

// Client island for the checkout contact step. Registered Puck block wrapper
// (ShopCheckoutContact) is a server component that renders this, so Puck's RSC
// <Render> never serialises its renderDropZone function bag into the client.
export function CheckoutContactClient({ preview = false, heading }: { preview?: boolean; heading?: string }) {
  const populated = useCartPopulated(preview)
  const initial = getCheckoutState()
  const [email, setEmail] = useState(initial.customerEmail)
  const [name, setName] = useState(initial.customerName)
  const [phone, setPhone] = useState(initial.customerPhone)
  // Whether the owner has made a phone number compulsory, from shop settings.
  // Fetched here rather than passed down from the RSC wrapper so the editor
  // preview draws the same form the storefront does. Assumed optional until the
  // answer arrives: labelling a field compulsory and then relenting is the
  // worse of the two wrong guesses, and the completeness check the payment and
  // review steps run reads the same setting for itself.
  const [phoneRequired, setPhoneRequired] = useState(false)
  const [phoneTouched, setPhoneTouched] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/m/shop/public/config')
      .then((r) => r.json())
      .then((d: { requirePhone?: boolean }) => { if (!cancelled) setPhoneRequired(d.requirePhone === true) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Empty basket: the order-summary block owns the "your basket is empty"
  // message; a contact form under it would suggest there is still an order to
  // place.
  if (!populated) return null

  // Specific, like the address fields: never a bare "required". Unlike them it
  // is checked as the shopper types rather than only when they leave the box - a
  // number is long enough to get wrong halfway through, and finding out on the
  // way past is a lot less annoying than finding out at the end. "Touched" still
  // gates it, so an untouched box is never told off.
  const typed = phone.trim()
  const phoneError = !phoneTouched
    ? null
    : typed.length === 0
      ? (phoneRequired ? 'Enter a phone number.' : null)
      : isValidUkPhone(typed) ? null : UK_PHONE_MESSAGE

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
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        <span>{phoneRequired ? 'Phone' : 'Phone (optional)'}</span>
        <input type="tel" required={phoneRequired} autoComplete="tel" inputMode="tel" data-shop-field="customerPhone" value={phone}
          // Marked touched by typing, not only by leaving: that is what lets the
          // message appear (and go again) while the number is being written.
          onChange={(e) => { setPhone(e.target.value); setPhoneTouched(true); updateCheckoutState({ customerPhone: e.target.value }) }}
          // Tidied to canonical form on the way out, so what the shopper reads
          // back is what the order will carry. Left exactly as typed when it is
          // not a number we can read - rewriting a wrong number would hide the
          // very thing the message underneath is complaining about.
          onBlur={() => {
            setPhoneTouched(true)
            const tidied = formatUkPhone(phone)
            if (tidied && tidied !== phone) { setPhone(tidied); updateCheckoutState({ customerPhone: tidied }) }
          }}
          aria-invalid={phoneError ? true : undefined}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: `1px solid ${phoneError ? 'var(--color-danger)' : 'var(--color-border)'}` }} />
        {phoneError && <span role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.8125rem' }}>{phoneError}</span>}
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Only used if there is a problem with your delivery.</span>
      </label>
    </section>
  )
}
