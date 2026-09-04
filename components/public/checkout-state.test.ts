import { describe, it, expect } from 'vitest'
import {
  EMPTY_CHECKOUT_STATE, isContactAndShippingComplete, missingCheckoutFields, checkoutBlockedSegments,
  type CheckoutState,
} from '@/modules/shop/components/public/checkout-state'

// This list is what a shopper reads when the order will not go through, so the
// wording and the order of it are the feature, not decoration: the labels have
// to match the boxes above it and the rows have to come in the order the page
// asks for them. The same function decides whether the button works at all,
// which is what stops the explanation and the button from ever disagreeing.

const FILLED: CheckoutState = {
  ...EMPTY_CHECKOUT_STATE,
  customerEmail: 'shopper@example.com',
  customerName: 'A Shopper',
  customerOrganisation: 'Shopper Ltd',
  customerPhone: '01234 567890',
  shippingAddress: {
    firstName: 'A', lastName: 'Shopper',
    line1: '1 High Street', line2: '', city: 'Leeds', county: '',
    postcode: 'LS1 1AA', country: 'GB', phone: '',
  },
}

const labels = (state: CheckoutState, opts?: Parameters<typeof missingCheckoutFields>[1]) =>
  missingCheckoutFields(state, opts).map((f) => f.label)

describe('missingCheckoutFields', () => {
  it('names every compulsory box on an untouched checkout, in page order', () => {
    expect(labels(EMPTY_CHECKOUT_STATE)).toEqual([
      'Email', 'Full name', 'First name', 'Last name', 'Address line 1', 'Town or city', 'Postcode',
    ])
  })

  it('says nothing about the optional boxes unless the shop asks for them', () => {
    expect(labels(EMPTY_CHECKOUT_STATE)).not.toContain('Phone')
    expect(labels(EMPTY_CHECKOUT_STATE)).not.toContain('Organisation name')
  })

  it('asks for the phone number when the shop requires one', () => {
    expect(labels(EMPTY_CHECKOUT_STATE, { phoneRequired: true })).toContain('Phone')
  })

  it('calls the organisation box whatever the owner calls it', () => {
    expect(labels(EMPTY_CHECKOUT_STATE, { organisationRequired: true, organisationLabel: ' Practice name ' }))
      .toContain('Practice name')
  })

  it('falls back to a sensible name for the organisation box when config has not arrived', () => {
    expect(labels(EMPTY_CHECKOUT_STATE, { organisationRequired: true })).toContain('Organisation name')
  })

  it('puts the organisation where the form puts it, under the full name and out of the address', () => {
    const asked = labels(EMPTY_CHECKOUT_STATE, { organisationRequired: true })
    expect(asked.indexOf('Organisation name')).toBeGreaterThan(asked.indexOf('Full name'))
    expect(asked.indexOf('Organisation name')).toBeLessThan(asked.indexOf('First name'))
  })

  it('is empty once everything is filled in', () => {
    expect(missingCheckoutFields(FILLED, { organisationRequired: true, phoneRequired: true })).toEqual([])
    expect(isContactAndShippingComplete(FILLED, { organisationRequired: true, phoneRequired: true })).toBe(true)
  })

  it('tells a typed-but-wrong email apart from a blank one', () => {
    expect(missingCheckoutFields({ ...FILLED, customerEmail: 'shopper@example' })).toEqual([
      { key: 'customerEmail', label: 'Email', reason: 'invalid', hint: 'that does not look like an email address.' },
    ])
    expect(missingCheckoutFields({ ...FILLED, customerEmail: '' })).toEqual([
      { key: 'customerEmail', label: 'Email', reason: 'empty' },
    ])
  })

  it('tells a typed-but-wrong phone number apart from a blank one', () => {
    // The hint travels with the row: a phone number must never be told it does
    // not look like an email address, which is what a fixed sentence at the
    // drawing end had it doing.
    expect(missingCheckoutFields({ ...FILLED, customerPhone: '0744 5163' }, { phoneRequired: true })).toEqual([
      { key: 'customerPhone', label: 'Phone', reason: 'invalid', hint: 'that does not look like a UK phone number.' },
    ])
    expect(missingCheckoutFields({ ...FILLED, customerPhone: '' }, { phoneRequired: true })).toEqual([
      { key: 'customerPhone', label: 'Phone', reason: 'empty' },
    ])
  })

  it('holds an unreadable phone number against a shopper even when the shop asks for none', () => {
    // Nobody has to give a number here, but a number that cannot be rung is
    // still going to be refused where the order is made - so the review step
    // says so now rather than letting the button fail later.
    expect(labels({ ...FILLED, customerPhone: '+33 6 12 34 56 78' })).toEqual(['Phone'])
    expect(labels({ ...FILLED, customerPhone: '' })).toEqual([])
  })

  it('takes a phone number written any of the usual ways', () => {
    for (const written of ['07445163570', '07445 163570', '+44 7445 163570', '+4407445163570', '020 8138 0512']) {
      expect(labels({ ...FILLED, customerPhone: written }, { phoneRequired: true }), written).toEqual([])
    }
  })

  it('treats a box holding nothing but spaces as empty', () => {
    expect(labels({ ...FILLED, shippingAddress: { ...FILLED.shippingAddress, postcode: '   ' } })).toEqual(['Postcode'])
  })

  it('hands back a key matching the box the shopper has to go and fix', () => {
    // The keys are the inputs' data-shop-field values; if these drift, the list
    // still reads correctly but clicking a row stops taking anyone anywhere.
    expect(missingCheckoutFields(EMPTY_CHECKOUT_STATE, { phoneRequired: true, organisationRequired: true })
      .map((f) => f.key)).toEqual([
      'customerEmail', 'customerName', 'customerOrganisation',
      'firstName', 'lastName', 'customerPhone', 'line1', 'city', 'postcode',
    ])
  })

  it('puts the phone number where the form puts it, under the names', () => {
    // It moved off the contact step and onto the delivery one, since the number
    // belongs to the address a parcel is going to rather than to the account.
    const asked = labels(EMPTY_CHECKOUT_STATE, { phoneRequired: true, organisationRequired: true })
    expect(asked.indexOf('Phone')).toBeGreaterThan(asked.indexOf('Last name'))
    expect(asked.indexOf('Phone')).toBeLessThan(asked.indexOf('Address line 1'))
  })
})

describe('the billing address', () => {
  const TICKED: CheckoutState = { ...FILLED, billingAddressDifferent: true }

  it('is never asked for on a shop that does not offer one, however the box is left', () => {
    expect(missingCheckoutFields(TICKED)).toEqual([])
    expect(isContactAndShippingComplete(TICKED)).toBe(true)
  })

  it('is never asked for while the shopper says it is the delivery address', () => {
    expect(missingCheckoutFields(FILLED, { billingAddressEnabled: true })).toEqual([])
  })

  it('names its own boxes, and only once the shopper says the two differ', () => {
    expect(labels(TICKED, { billingAddressEnabled: true })).toEqual([
      'Billing first name', 'Billing last name', 'Billing address line 1', 'Billing town or city', 'Billing postcode',
    ])
  })

  it('sends the shopper to the billing box rather than the delivery box of the same name', () => {
    const keys = missingCheckoutFields(TICKED, { billingAddressEnabled: true }).map((f) => f.key)
    expect(keys).toContain('billingLine1')
    expect(keys).not.toContain('line1')
  })

  it('comes last, after everything the delivery itself needs', () => {
    const asked = labels({ ...EMPTY_CHECKOUT_STATE, billingAddressDifferent: true }, { billingAddressEnabled: true })
    expect(asked.indexOf('Billing first name')).toBeGreaterThan(asked.indexOf('Postcode'))
  })

  it('holds the order up until it is filled in', () => {
    expect(isContactAndShippingComplete(TICKED, { billingAddressEnabled: true })).toBe(false)
    const done: CheckoutState = {
      ...TICKED,
      billingAddress: {
        firstName: 'A', lastName: 'Shopper',
        line1: 'Accounts, 90 Example Street', line2: '', city: 'Sheffield', county: '',
        postcode: 'S1 1AA', country: 'GB', phone: '',
      },
    }
    expect(isContactAndShippingComplete(done, { billingAddressEnabled: true })).toBe(true)
  })
})

describe('isContactAndShippingComplete', () => {
  it('refuses a checkout that is missing one box, whichever box it is', () => {
    expect(isContactAndShippingComplete({ ...FILLED, customerName: '' })).toBe(false)
    expect(isContactAndShippingComplete({ ...FILLED, shippingAddress: { ...FILLED.shippingAddress, city: '' } })).toBe(false)
  })

  it('only holds the optional boxes against a shopper when the shop requires them', () => {
    const noPhone = { ...FILLED, customerPhone: '' }
    expect(isContactAndShippingComplete(noPhone)).toBe(true)
    expect(isContactAndShippingComplete(noPhone, { phoneRequired: true })).toBe(false)
  })
})

describe('checkoutBlockedSegments', () => {
  const say = (segments: { text: string }[]) => segments.map((s) => s.text).join('')
  const PAY = { key: 'paymentMethod', text: 'choose a payment method above' }
  const TICK = { key: 'agreements', text: 'tick the box marked *' }

  it('says nothing at all when nothing is holding the button shut', () => {
    expect(checkoutBlockedSegments([], [])).toEqual([])
  })

  it('says the boxes and the payment choice in one sentence, not two notices', () => {
    const segments = checkoutBlockedSegments(
      [{ key: 'customerEmail', label: 'Email', reason: 'empty' }, { key: 'customerName', label: 'Full name', reason: 'empty' }],
      [PAY],
    )
    expect(say(segments)).toBe('Complete your email and full name above, and then choose a payment method above to place your order.')
  })

  it('opens with a capital even when the first word is a link', () => {
    expect(say(checkoutBlockedSegments([], [PAY]))).toBe('Choose a payment method above to place your order.')
  })

  it('links every outstanding bit to the box or choice it names', () => {
    const segments = checkoutBlockedSegments([{ key: 'customerEmail', label: 'Email', reason: 'empty' }], [PAY, TICK])
    expect(segments.filter((s) => s.fieldKey).map((s) => s.fieldKey))
      .toEqual(['customerEmail', 'paymentMethod', 'agreements'])
    // The separators are wording, not links - clicking " and " takes nobody anywhere.
    expect(segments.filter((s) => !s.fieldKey).every((s) => s.text.trim().length === 0 || /[a-z*.]/i.test(s.text))).toBe(true)
  })

  it('tells a box filled in wrongly apart from one left blank', () => {
    const segments = checkoutBlockedSegments([
      { key: 'customerName', label: 'Full name', reason: 'empty' },
      { key: 'customerEmail', label: 'Email', reason: 'invalid', hint: 'that does not look like an email address.' },
    ], [])
    expect(say(segments)).toBe(
      'Complete your full name and correct your email above to place your order.'
      + ' Email - that does not look like an email address.'
    )
  })

  it('lists three outstanding boxes with commas and a final and', () => {
    const segments = checkoutBlockedSegments([
      { key: 'line1', label: 'Address line 1', reason: 'empty' },
      { key: 'city', label: 'Town or city', reason: 'empty' },
      { key: 'postcode', label: 'Postcode', reason: 'empty' },
    ], [])
    expect(say(segments)).toBe('Complete your address line 1, town or city and postcode above to place your order.')
  })

  it('joins two outstanding decisions rather than sending anyone back twice', () => {
    expect(say(checkoutBlockedSegments([], [PAY, TICK])))
      .toBe('Choose a payment method above and tick the box marked * to place your order.')
  })
})
