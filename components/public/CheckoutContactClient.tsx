'use client'

import { useEffect, useState, type ComponentType } from 'react'
import type { ShopCheckoutContactExtraProps } from '@/modules/shop/components/public/checkout-contact-extras'
import { getCheckoutState, updateCheckoutState } from '@/modules/shop/components/public/checkout-state'
import { useCartPopulated } from '@/modules/shop/components/public/use-cart-populated'
import { fetchShopPublicConfig } from '@/modules/shop/lib/public-config-client'

// The organisation box and whether it is compulsory, from shop settings.
// Fetched here rather than passed down from the RSC wrapper so the editor
// preview draws the same form the storefront does.
type OrganisationConfig = { enabled: boolean; required: boolean; label: string }

// The customer's own reference box - their purchase order number - and whether
// an order can be placed without one. Same three answers, same source.
type CustomerReferenceConfig = { enabled: boolean; required: boolean; label: string }

// Client island for the checkout contact step. Registered Puck block wrapper
// (ShopCheckoutContact) is a server component that renders this, so Puck's RSC
// <Render> never serialises its renderDropZone function bag into the client.
//
// Name, organisation, email. The phone number moved to the delivery step, under
// the names it belongs with: a number is how a courier reaches whoever is at
// that door, which is not always the person paying, so it travels with the
// address rather than with the account.
//
// The organisation went the other way. It used to be asked for as part of the
// delivery address, above line 1, which repeated it on every saved address and
// described the buyer rather than the door. It sits under the name now, with the
// rest of who-you-are. A company that has to appear on the delivery label goes
// in address line 1, where a courier actually reads it.
//
// Name first, then email: it is the order a person expects to be asked in, and
// it puts the email box last, immediately above anything a module has to say
// about that address (see the extras below).
export function CheckoutContactClient({ preview = false, heading, extras = [] }: {
  preview?: boolean
  heading?: string
  // Contributed by modules through 'shop.checkout-contact-extras'. Resolved on
  // the server and handed down; see lib/checkout-contact-extras.ts.
  extras?: ComponentType<ShopCheckoutContactExtraProps>[]
}) {
  const populated = useCartPopulated(preview)
  const initial = getCheckoutState()
  const [email, setEmail] = useState(initial.customerEmail)
  const [name, setName] = useState(initial.customerName)
  const [organisation, setOrganisation] = useState(initial.customerOrganisation)
  const [organisationConfig, setOrganisationConfig] = useState<OrganisationConfig | null>(null)
  const [organisationTouched, setOrganisationTouched] = useState(false)
  const [reference, setReference] = useState(initial.customerReference)
  const [referenceConfig, setReferenceConfig] = useState<CustomerReferenceConfig | null>(null)
  const [referenceTouched, setReferenceTouched] = useState(false)

  // The name and organisation the shopper keeps on their account, if they are
  // signed in and have filled them in. A signed-out shopper gets an empty 204
  // and nothing changes - an ordinary answer, deliberately not an error status,
  // because otherwise every guest checkout opened with a red line in the
  // console. The `r.ok` arm still covers a 401 from a shop whose server half has
  // not been updated yet.
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
      // 204 has no body to parse, so it is answered as "nothing" before json()
      // is ever reached rather than being left to throw into the catch below.
      .then((r) => (r.ok && r.status !== 204 ? r.json() : null))
      .then((d: { fullName?: string | null; organisation?: string | null } | null) => {
        if (cancelled || !d) return
        const stored = getCheckoutState()
        if (d.fullName && stored.customerName.trim().length === 0) {
          setName(d.fullName)
          updateCheckoutState({ customerName: d.fullName })
        }
        if (d.organisation && stored.customerOrganisation.trim().length === 0) {
          setOrganisation(d.organisation)
          updateCheckoutState({ customerOrganisation: d.organisation })
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [preview])

  useEffect(() => {
    let cancelled = false
    fetchShopPublicConfig<{ organisation?: OrganisationConfig; customerReference?: CustomerReferenceConfig }>()
      .then((d) => {
        if (cancelled || !d) return
        if (d.organisation) setOrganisationConfig(d.organisation)
        if (d.customerReference) setReferenceConfig(d.customerReference)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Specific and fix-stating, never a bare "required", and built from the
  // owner's own label - "Enter your practice name." reads properly where
  // "Enter your organisation name." would be a lie on that shop. Only once the
  // shopper has left the box: nothing is told off before it is reached.
  const organisationError = organisationConfig?.enabled && organisationConfig.required
    && organisationTouched && organisation.trim().length === 0
    ? `Enter your ${organisationConfig.label.trim().toLowerCase() || 'organisation name'}.`
    : null

  const referenceError = referenceConfig?.enabled && referenceConfig.required
    && referenceTouched && reference.trim().length === 0
    ? `Enter your ${referenceConfig.label.trim().toLowerCase() || 'purchase order number'}.`
    : null

  // Empty basket: the order-summary block owns the "your basket is empty"
  // message; a contact form under it would suggest there is still an order to
  // place.
  if (!populated) return null

  return (
    <section style={{ display: 'grid', gap: '0.75rem', maxWidth: 480 }}>
      <h2 style={{ fontSize: '1.125rem', margin: 0 }}>{heading || 'Contact details'}</h2>
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        <span>Full name</span>
        {/* data-shop-field is how the review step finds this box when it lists
            what is still outstanding - see focusCheckoutField. */}
        <input type="text" required autoComplete="name" data-shop-field="customerName" value={name} onChange={(e) => { setName(e.target.value); updateCheckoutState({ customerName: e.target.value }) }}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
      </label>
      {/* Under the name, above the email: it belongs with who the shopper is.
          Optional by default, so the label says so out loud rather than leaving
          somebody wondering whether a blank box will stop them. */}
      {organisationConfig?.enabled && (
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span>{organisationConfig.required ? organisationConfig.label : `${organisationConfig.label} (optional)`}</span>
          <input
            type="text"
            required={organisationConfig.required}
            autoComplete="organization"
            data-shop-field="customerOrganisation"
            value={organisation}
            onChange={(e) => { setOrganisation(e.target.value); updateCheckoutState({ customerOrganisation: e.target.value }) }}
            onBlur={() => setOrganisationTouched(true)}
            aria-invalid={organisationError ? true : undefined}
            style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: `1px solid ${organisationError ? 'var(--color-danger)' : 'var(--color-border)'}` }}
          />
          {organisationError && <span role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.8125rem' }}>{organisationError}</span>}
        </label>
      )}
      {/* Under the organisation, because that is the order a trade buyer is
          asked in: who they are, then what their own finance team files this
          order under. Never filled in from the account - a purchase order
          number belongs to one order, not to a customer. */}
      {referenceConfig?.enabled && (
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span>{referenceConfig.required ? referenceConfig.label : `${referenceConfig.label} (optional)`}</span>
          <input
            type="text"
            required={referenceConfig.required}
            data-shop-field="customerReference"
            value={reference}
            onChange={(e) => { setReference(e.target.value); updateCheckoutState({ customerReference: e.target.value }) }}
            onBlur={() => setReferenceTouched(true)}
            aria-invalid={referenceError ? true : undefined}
            style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: `1px solid ${referenceError ? 'var(--color-danger)' : 'var(--color-border)'}` }}
          />
          {referenceError && <span role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.8125rem' }}>{referenceError}</span>}
        </label>
      )}
      <label style={{ display: 'grid', gap: '0.25rem' }}>
        <span>Email</span>
        <input type="email" required autoComplete="email" inputMode="email" data-shop-field="customerEmail" value={email} onChange={(e) => { setEmail(e.target.value); updateCheckoutState({ customerEmail: e.target.value }) }}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)' }} />
      </label>
      {/* Whatever a module has to ask about that address, directly under it -
          a question about emails belongs beside the email box, not three steps
          away at the bottom of the order. */}
      {extras.map((Extra, index) => (
        <Extra key={index} customerEmail={email} preview={preview} />
      ))}
    </section>
  )
}
