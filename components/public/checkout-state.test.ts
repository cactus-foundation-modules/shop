import { describe, it, expect } from 'vitest'
import {
  EMPTY_CHECKOUT_STATE, isContactAndShippingComplete, missingCheckoutFields,
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
  customerPhone: '01234 567890',
  shippingAddress: {
    firstName: 'A', lastName: 'Shopper', company: 'Shopper Ltd',
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
    expect(labels(EMPTY_CHECKOUT_STATE)).not.toContain('Business name')
  })

  it('asks for the phone number when the shop requires one', () => {
    expect(labels(EMPTY_CHECKOUT_STATE, { phoneRequired: true })).toContain('Phone')
  })

  it('calls the business-name box whatever the owner calls it', () => {
    expect(labels(EMPTY_CHECKOUT_STATE, { businessNameRequired: true, businessNameLabel: ' Delivery depot ' }))
      .toContain('Delivery depot')
  })

  it('falls back to a sensible name for the business-name box when config has not arrived', () => {
    expect(labels(EMPTY_CHECKOUT_STATE, { businessNameRequired: true })).toContain('Business name')
  })

  it('puts the business name where the form puts it, above address line 1', () => {
    const asked = labels(EMPTY_CHECKOUT_STATE, { businessNameRequired: true })
    expect(asked.indexOf('Business name')).toBeLessThan(asked.indexOf('Address line 1'))
    expect(asked.indexOf('Business name')).toBeGreaterThan(asked.indexOf('Last name'))
  })

  it('is empty once everything is filled in', () => {
    expect(missingCheckoutFields(FILLED, { businessNameRequired: true, phoneRequired: true })).toEqual([])
    expect(isContactAndShippingComplete(FILLED, { businessNameRequired: true, phoneRequired: true })).toBe(true)
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
    expect(missingCheckoutFields(EMPTY_CHECKOUT_STATE, { phoneRequired: true, businessNameRequired: true })
      .map((f) => f.key)).toEqual([
      'customerEmail', 'customerName', 'customerPhone',
      'firstName', 'lastName', 'company', 'line1', 'city', 'postcode',
    ])
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
