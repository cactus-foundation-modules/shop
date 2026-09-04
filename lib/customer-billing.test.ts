import { describe, expect, it } from 'vitest'
import {
  billingChangeEffect,
  currentBillingIdentity,
  customerCanEditBilling,
  normaliseAddress,
  normaliseCompanyName,
  reissueAvailable,
} from '@/modules/shop/lib/customer-billing'
import type { ShpAddress, ShpInvoice, ShpOrder } from '@/modules/shop/lib/types'
import type { ShpConfig } from '@/modules/shop/lib/config'

// The line between "correct the document" and "credit it and start again".
//
// It is a statutory line, not a tidy one, and getting it wrong is expensive in
// both directions: crediting an invoice over a changed postcode burns two
// document numbers and worries a customer's accountant for nothing, and editing
// a company name in place puts a supply to one legal person on a document
// addressed to another. These tests pin which side each case falls on.

const ADDRESS: ShpAddress = {
  firstName: 'Jane', lastName: 'Smith',
  line1: '4 Example Road', city: 'Manchester', postcode: 'M1 2AB', country: 'GB',
}

const ORDER = {
  status: 'COMPLETED', customerOrganisation: 'Acme Ltd',
  billingAddress: ADDRESS, shippingAddress: ADDRESS,
} as unknown as ShpOrder
const INVOICE = { id: 'inv_1' } as unknown as ShpInvoice

function config(overrides: Partial<ShpConfig> = {}): ShpConfig {
  return {
    customerBillingEditEnabled: true,
    customerBillingReissueEnabled: true,
    invoicesEnabled: true,
    creditNotesEnabled: true,
    ...overrides,
  } as unknown as ShpConfig
}

describe('customerCanEditBilling', () => {
  it('is offered where the shop has switched it on', () => {
    expect(customerCanEditBilling({ config: config(), order: ORDER }).allowed).toBe(true)
  })

  it('is not offered where the shop has not', () => {
    expect(customerCanEditBilling({ config: config({ customerBillingEditEnabled: false }), order: ORDER }).allowed).toBe(false)
  })

  it('is closed once the order is cancelled or refunded', () => {
    for (const status of ['CANCELLED', 'REFUNDED']) {
      const order = { ...ORDER, status } as unknown as ShpOrder
      expect(customerCanEditBilling({ config: config(), order }).allowed).toBe(false)
    }
  })
})

describe('normalising, before two values are called different', () => {
  it('ignores case and spacing on a company name', () => {
    expect(normaliseCompanyName('  acme   LTD ')).toBe(normaliseCompanyName('Acme Ltd'))
  })

  it('keeps punctuation, because "Acme Ltd." may genuinely be another firm', () => {
    expect(normaliseCompanyName('Acme Ltd.')).not.toBe(normaliseCompanyName('Acme Ltd'))
  })

  it('treats a missing address and a null one as the same nothing', () => {
    expect(normaliseAddress(null)).toBe(normaliseAddress(undefined))
  })

  it('notices a moved postcode', () => {
    expect(normaliseAddress({ ...ADDRESS, postcode: 'LS1 1AA' })).not.toBe(normaliseAddress(ADDRESS))
  })
})

describe('billingChangeEffect', () => {
  const current = currentBillingIdentity(ORDER)

  it('does nothing when nothing has changed', () => {
    expect(billingChangeEffect(current, { organisation: 'Acme Ltd', billingAddress: ADDRESS }, INVOICE).kind).toBe('none')
  })

  it('does nothing when only the capitals have changed', () => {
    expect(billingChangeEffect(current, { organisation: 'ACME LTD', billingAddress: ADDRESS }, INVOICE).kind).toBe('none')
  })

  it('corrects the invoice in place when only the address moved', () => {
    const effect = billingChangeEffect(
      current,
      { organisation: 'Acme Ltd', billingAddress: { ...ADDRESS, line1: '90 Example Street', city: 'Leeds', postcode: 'LS1 1AA' } },
      INVOICE,
    )
    expect(effect.kind).toBe('order')
    expect(effect.amendsInvoice).toBe(true)
    expect(effect.companyChanged).toBe(false)
  })

  it('has no invoice to correct where none has been raised', () => {
    const effect = billingChangeEffect(current, { organisation: 'Acme Ltd', billingAddress: { ...ADDRESS, postcode: 'LS1 1AA' } }, null)
    expect(effect.kind).toBe('order')
    expect(effect.amendsInvoice).toBe(false)
  })

  it('credits and replaces when the company changed after an invoice went out', () => {
    const effect = billingChangeEffect(current, { organisation: 'Acme Holdings Ltd', billingAddress: ADDRESS }, INVOICE)
    expect(effect.kind).toBe('reissue')
    expect(effect.companyChanged).toBe(true)
  })

  it('is a plain order change when the company changes BEFORE any invoice', () => {
    const effect = billingChangeEffect(current, { organisation: 'Acme Holdings Ltd', billingAddress: ADDRESS }, null)
    expect(effect.kind).toBe('order')
    expect(effect.amendsInvoice).toBe(false)
  })

  it('reissues rather than amends when both changed at once', () => {
    const effect = billingChangeEffect(
      current,
      { organisation: 'Acme Holdings Ltd', billingAddress: { ...ADDRESS, postcode: 'LS1 1AA' } },
      INVOICE,
    )
    expect(effect.kind).toBe('reissue')
    // The replacement is raised with the new address on it, so there is nothing
    // left to correct on the old one.
    expect(effect.amendsInvoice).toBe(false)
  })

  it('counts dropping the company altogether as a change of company', () => {
    expect(billingChangeEffect(current, { organisation: '', billingAddress: ADDRESS }, INVOICE).kind).toBe('reissue')
  })
})

describe('reissueAvailable', () => {
  it('is available with invoices, credit notes and the switch all on', () => {
    expect(reissueAvailable(config()).allowed).toBe(true)
  })

  it('is refused where the owner would rather be telephoned', () => {
    expect(reissueAvailable(config({ customerBillingReissueEnabled: false })).allowed).toBe(false)
  })

  it('is refused without credit notes, because the sale would be booked twice', () => {
    expect(reissueAvailable(config({ creditNotesEnabled: false })).allowed).toBe(false)
  })

  it('is refused on a shop that does not invoice at all', () => {
    expect(reissueAvailable(config({ invoicesEnabled: false })).allowed).toBe(false)
  })
})

describe('currentBillingIdentity', () => {
  it('reads the company the invoice would print, not just the column', () => {
    // An order placed before the organisation moved off the address, whose
    // column was never filled in. The invoice prints the delivery company, so
    // that is what a change has to be compared against.
    const legacy = {
      status: 'COMPLETED', customerOrganisation: null, billingAddress: null,
      shippingAddress: { ...ADDRESS, company: 'Acme Ltd' },
    } as unknown as ShpOrder
    expect(currentBillingIdentity(legacy).organisation).toBe('Acme Ltd')
  })

  it('lets a cleared company stay cleared once the order has a billing address', () => {
    // The trap this exists for: migration 027 copied the delivery label's
    // company into the order's own column, so a customer clearing it would
    // have had it handed straight back by the fallback.
    const cleared = {
      status: 'COMPLETED', customerOrganisation: null, billingAddress: ADDRESS,
      shippingAddress: { ...ADDRESS, company: 'Acme Ltd' },
    } as unknown as ShpOrder
    expect(currentBillingIdentity(cleared).organisation).toBe('')
  })
})
