'use client'

import { useEffect, useState, type ComponentType, type CSSProperties, type InputHTMLAttributes } from 'react'
import { getCart } from '@/modules/shop/components/public/cart'
import { EMPTY_ADDRESS, getCheckoutState, updateCheckoutState, type ShpAddressForm } from '@/modules/shop/components/public/checkout-state'
import type { ShopCheckoutAddressLookupProps, ShpLookupAddress } from '@/modules/shop/components/public/checkout-address-lookup'
import { formatUkPhone, isValidUkPhone, UK_PHONE_MESSAGE } from '@/modules/shop/lib/phone'
import { useCartPopulated } from '@/modules/shop/components/public/use-cart-populated'
import { fetchShopPublicConfig } from '@/modules/shop/lib/public-config-client'

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

// An address the shopper has ordered to before. Stored fields are all optional
// (the account page's own form asks for fewer than checkout does), so nothing
// here may assume a field is present.
type SavedAddress = { id: string; label: string | null; isDefault: boolean; address: Partial<ShpAddressForm> }

function toAddressForm(a: Partial<ShpAddressForm>): ShpAddressForm {
  return {
    firstName: a.firstName ?? '', lastName: a.lastName ?? '',
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

// Which of the two things the shopper has said. `null` is the third state and a
// real one: the address book has arrived but nothing has been picked out of it
// yet, which is neither "this saved one" nor "a different one" and must not be
// drawn as either.
type AddressChoice = { kind: 'saved'; id: string } | { kind: 'new' }

// Same address, allowing for the ways the same address gets typed. Used to work
// out which radio to tick when a shopper comes back to this step with an address
// already in their checkout - without it, an address picked out of the book two
// steps ago comes back looking like something they typed themselves.
function sameAddress(a: ShpAddressForm, b: ShpAddressForm): boolean {
  const tidy = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase()
  return (Object.keys(EMPTY_ADDRESS) as Array<keyof ShpAddressForm>)
    .every((k) => tidy(a[k]) === tidy(b[k]))
}

// The boxes this shop cannot take an order without. A saved address is only
// allowed to stand in for the form when it actually answers all of them - the
// account page asks for fewer fields than checkout does, so an address saved
// there can be perfectly good and still be short of a postcode.
function missingFromSaved(a: ShpAddressForm, opts: { phoneRequired: boolean }): boolean {
  const required: Array<keyof ShpAddressForm> = ['firstName', 'lastName', 'line1', 'city', 'postcode']
  // A shop that insists on a number counts an address saved without one as
  // short: otherwise picking it hides the only box the shopper could put one in,
  // and the order is refused two steps later with nowhere to go and fix it.
  if (opts.phoneRequired) required.push('phone')
  return required.some((k) => a[k].trim().length === 0)
}

const OPTION_STYLE: CSSProperties = {
  display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
  border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.5rem 0.75rem',
}

export function CheckoutShippingClient({
  preview = false,
  addressLookup = null,
  heading,
  methodHeading,
}: {
  preview?: boolean
  // Resolved server-side from the 'shop.checkout-address-lookup' extension
  // point (see lib/checkout-address-lookup.ts) - null when no provider module
  // is installed, and always null in the editor preview.
  addressLookup?: ComponentType<ShopCheckoutAddressLookupProps> | null
  heading?: string
  methodHeading?: string
}) {
  const populated = useCartPopulated(preview)
  const initial = getCheckoutState()
  const [address, setAddress] = useState<ShpAddressForm>(initial.shippingAddress)
  const [rates, setRates] = useState<ShippingRateOption[]>([])
  const [selectedRateId, setSelectedRateId] = useState<string | null>(initial.shippingRateId)
  const [touched, setTouched] = useState<Partial<Record<keyof ShpAddressForm, boolean>>>({})
  // Whether the owner has made a phone number compulsory, from shop settings.
  // Assumed optional until the answer arrives: labelling a field compulsory and
  // then relenting is the worse of the two wrong guesses, and the completeness
  // check the payment and review steps run reads the same setting for itself.
  const [phoneRequired, setPhoneRequired] = useState(false)
  const [phoneTouched, setPhoneTouched] = useState(false)
  // Addresses this shopper has ordered to before. A signed-out shopper gets a
  // 401 and an empty list, which draws nothing - the form below is unchanged
  // for them.
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([])
  const [choice, setChoice] = useState<AddressChoice | null>(null)

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
        // this block mid-checkout, keeps what they have - and the radio is set to
        // whichever of the two that address actually is, so the picker and the
        // fields below can never contradict each other on arrival.
        const stored = getCheckoutState().shippingAddress
        if (stored.line1.trim().length > 0) {
          const match = list.find((a) => sameAddress(toAddressForm(a.address), stored))
          setChoice(match ? { kind: 'saved', id: match.id } : { kind: 'new' })
          return
        }
        const preferred = list.find((a) => a.isDefault) ?? list[0]
        if (!preferred) return
        const form = toAddressForm(preferred.address)
        setAddress(form)
        setChoice({ kind: 'saved', id: preferred.id })
        updateCheckoutState({ shippingAddress: form, customerPhone: form.phone })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [preview])

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

  function set<K extends keyof ShpAddressForm>(key: K, value: ShpAddressForm[K]) {
    const next = { ...address, [key]: value }
    setAddress(next)
    // The number the order actually carries is customerPhone - that is what the
    // review step checks, what the order-creating route enforces and what the
    // admin screens show. The address keeps its own copy so the number is filed
    // with the door it belongs to, and the two are always written together so
    // they cannot drift apart.
    updateCheckoutState(key === 'phone' ? { shippingAddress: next, customerPhone: next.phone } : { shippingAddress: next })
    // Typing over an address out of the book means this is no longer that
    // address. Only reachable while the fields are on screen - which is to say
    // while "a different address" is already the answer, or while a picked
    // address turned out to be short of something - and the edits stay put
    // either way, since nothing in the address book is being changed here.
    if (choice?.kind !== 'saved') setChoice({ kind: 'new' })
  }

  function chooseSaved(saved: SavedAddress) {
    const form = toAddressForm(saved.address)
    // A whole-form replacement, never a merge: anything the shopper typed before
    // changing their mind is gone rather than left hiding behind a collapsed
    // form, waiting to go on the order in a field this saved address left blank.
    setAddress(form)
    setChoice({ kind: 'saved', id: saved.id })
    // The saved address brings its phone number with it - that is the point of
    // keeping one per address - so the order's number changes with the door.
    updateCheckoutState({ shippingAddress: form, customerPhone: form.phone })
    // Errors raised against the address being replaced are not errors in this
    // one, so the blur-time messages start again from clean.
    setTouched({})
    setPhoneTouched(false)
  }

  function chooseNew() {
    // Blank, not "the saved address, to edit". Asked for a different address and
    // handed somebody else's half of one is how a delivery ends up at the old
    // office with the new postcode on it.
    setAddress(EMPTY_ADDRESS)
    setChoice({ kind: 'new' })
    updateCheckoutState({ shippingAddress: EMPTY_ADDRESS, customerPhone: '' })
    setTouched({})
    setPhoneTouched(false)
  }

  function fieldError(key: keyof ShpAddressForm): string | null {
    const message = REQUIRED_MESSAGES[key]
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
    if (choice?.kind !== 'saved') setChoice({ kind: 'new' })
  }

  // Real <label>s, not placeholder-as-label: a placeholder vanishes the moment
  // typing starts and never reaches a screen reader as the field's name.
  // `extra` lets an address-lookup provider layer combobox behaviour onto the
  // input while this component keeps sole ownership of the markup; shop's own
  // handlers run first, then the provider's.
  function field(key: keyof ShpAddressForm, label: string, autoComplete: string, required: boolean, extra?: InputHTMLAttributes<HTMLInputElement>) {
    const error = fieldError(key)
    return (
      // alignContent start, not the default stretch: two of these sit side by
      // side in a 1fr 1fr row, and a message under one of them makes that row
      // taller. Stretched auto rows would spend the extra height on the other
      // box, so the pair drift out of line the moment one is told off.
      <label style={{ display: 'grid', gap: '0.25rem', alignContent: 'start' }}>
        <span>{label}</span>
        <input
          {...extra}
          type="text"
          required={required}
          autoComplete={extra?.autoComplete ?? autoComplete}
          // How the review step finds this box when it lists what is still
          // outstanding (see focusCheckoutField). After the spread on purpose:
          // an address-lookup provider layering itself onto line 1 must not be
          // able to take the marker off it.
          data-shop-field={key}
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

  // An address out of the book that checkout cannot actually deliver to. The
  // form comes back out for it: the alternative is a shopper being told on the
  // review step that their postcode is missing, with nowhere on the page to put
  // one. Judged on the book's own copy rather than on what is in the form, so
  // that typing the missing postcode in does not pull the form out from under
  // the shopper mid-word.
  const chosenSaved = choice?.kind === 'saved'
    ? savedAddresses.find((a) => a.id === choice.id) ?? null
    : null
  const savedIsShort = chosenSaved != null
    && missingFromSaved(toAddressForm(chosenSaved.address), { phoneRequired })

  // The form is the "different address" form, so it is only on screen when that
  // is what the shopper has asked for. A picked saved address collapses it
  // rather than disabling it - a disabled copy of an address is still a set of
  // boxes to read past, and still somewhere for a half-typed one to hide.
  // Nothing to pick from means there was never a choice to make, so it stays.
  const showFields = savedAddresses.length === 0 || choice?.kind === 'new' || savedIsShort

  // Specific, like the address fields: never a bare "required". An unreadable
  // number is held against the shopper whether or not the shop insists on one,
  // because the order-creating route refuses it either way.
  const typedPhone = address.phone.trim()
  const phoneError = !phoneTouched
    ? null
    : typedPhone.length === 0
      ? (phoneRequired ? 'Enter a phone number.' : null)
      : isValidUkPhone(typedPhone) ? null : UK_PHONE_MESSAGE

  // Empty basket: no order to deliver, so no address to ask for - the
  // order-summary block carries the empty message.
  if (!populated) return null

  return (
    // The top margin is the gap to the step above: these are separate blocks in
    // one Puck zone, so nothing else puts air between the checkout steps.
    <section style={{ display: 'grid', gap: '0.75rem', maxWidth: 480, marginTop: '2rem' }}>
      <h2 style={{ fontSize: '1.125rem', margin: 0 }}>{heading || 'Delivery address'}</h2>

      {/* Only drawn for a signed-in shopper who has an address book with
          something in it. Picking one of them is the whole answer to this step,
          so the form below goes away while one is picked; "Use a different
          address" brings it back, empty. */}
      {savedAddresses.length > 0 && (
        <fieldset style={{ display: 'grid', gap: '0.5rem', border: 0, margin: 0, padding: 0 }}>
          <legend style={{ fontSize: '0.9375rem', fontWeight: 'var(--font-medium)', padding: 0, marginBottom: '0.25rem' }}>Deliver to</legend>
          {savedAddresses.map((saved) => (
            <label key={saved.id} style={OPTION_STYLE}>
              <input
                type="radio"
                name="savedAddress"
                checked={choice?.kind === 'saved' && choice.id === saved.id}
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
              // Deliberately not "nothing picked": a shopper who has not answered
              // yet has this unticked too, and ticking it for them would put an
              // empty form on screen as though they had asked for one.
              checked={choice?.kind === 'new'}
              onChange={chooseNew}
              style={{ marginTop: '0.2rem' }}
            />
            <span>Use a different address</span>
          </label>
        </fieldset>
      )}

      {savedIsShort && (
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          This saved address is missing something we need for delivery. Finish it below and the order will use what you fill in here.
        </p>
      )}

      {showFields && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {field('firstName', 'First name', 'given-name', true)}
            {field('lastName', 'Last name', 'family-name', true)}
          </div>
          {/* Under the names: the number belongs to
              whoever is at this door rather than to the account, which is why it
              is kept with the address and not on the member's own details.
              Checked as the shopper types rather than only when they leave the
              box - a number is long enough to get wrong halfway through, and
              finding out on the way past is less annoying than finding out at
              the end. "Touched" still gates it, so an untouched box is never
              told off. */}
          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span>{phoneRequired ? 'Phone' : 'Phone (optional)'}</span>
            <input
              type="tel"
              required={phoneRequired}
              autoComplete="tel"
              inputMode="tel"
              data-shop-field="customerPhone"
              value={address.phone}
              onChange={(e) => { setPhoneTouched(true); set('phone', e.target.value) }}
              // Tidied to canonical form on the way out, so what the shopper
              // reads back is what the order will carry. Left exactly as typed
              // when it is not a number we can read - rewriting a wrong number
              // would hide the very thing the message underneath complains of.
              onBlur={() => {
                setPhoneTouched(true)
                const tidied = formatUkPhone(address.phone)
                if (tidied && tidied !== address.phone) set('phone', tidied)
              }}
              aria-invalid={phoneError ? true : undefined}
              style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: `1px solid ${phoneError ? 'var(--color-danger)' : 'var(--color-border)'}` }}
            />
            {phoneError && <span role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.8125rem' }}>{phoneError}</span>}
          </label>
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
        </>
      )}

      {rates.length > 0 && (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <h3 style={{ fontSize: '0.9375rem', margin: 0 }}>{methodHeading || 'Delivery method'}</h3>
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
