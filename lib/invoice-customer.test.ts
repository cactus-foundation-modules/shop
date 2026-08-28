import { describe, expect, it } from 'vitest'
import { buildCustomer } from '@/modules/shop/lib/invoices'
import type { ShpOrder } from '@/modules/shop/lib/types'

// Who the invoice is made out to, frozen at the moment it is raised.
//
// The rule this pins is a statutory one rather than a tidy one: a VAT invoice is
// the record of what was charged on a given day. A customer who renames their
// company or moves office must find last year's invoice still saying what it
// said when it was sent, or their books and ours stop agreeing.
//
// The invoice therefore holds a copy - name, organisation, both addresses - and
// never a route back to the order. These tests fail the moment somebody swaps
// one of them for a reference.

const ORDER = {
  customerName: 'Jane Smith',
  customerOrganisation: 'Acme Ltd',
  customerReference: 'PO-4471',
  customerEmail: 'jane@acme.example',
  customerPhone: '0113 496 0000',
  shippingAddress: {
    firstName: 'Jane', lastName: 'Smith', company: 'Acme Ltd',
    line1: '4 Example Road', line2: null, city: 'Manchester',
    county: null, postcode: 'M1 2AB', country: 'GB',
  },
  billingAddress: {
    firstName: 'Jane', lastName: 'Smith', company: 'Acme Ltd',
    line1: 'Accounts, 90 Example Street', line2: null, city: 'Leeds',
    county: null, postcode: 'LS1 1AA', country: 'GB',
  },
} as unknown as ShpOrder

describe('buildCustomer', () => {
  it('takes the organisation from the order it was raised against', () => {
    expect(buildCustomer(ORDER).company).toBe('Acme Ltd')
  })

  it('bills to the billing address where one was given', () => {
    expect(buildCustomer(ORDER).billingAddress).toContain('Accounts, 90 Example Street')
  })

  it('bills to the delivery address on a shop that never asks for a billing one', () => {
    const noBilling = { ...ORDER, billingAddress: null } as unknown as ShpOrder
    expect(buildCustomer(noBilling).billingAddress).toContain('4 Example Road')
  })

  it('is a copy, so renaming the company afterwards cannot rewrite the invoice', () => {
    const order = {
      ...ORDER,
      shippingAddress: { ...ORDER.shippingAddress },
      billingAddress: { ...ORDER.billingAddress },
    } as unknown as ShpOrder
    const snapshot = buildCustomer(order)

    // The customer moves and rebrands, and somebody corrects the order to match.
    const mutable = order as unknown as { customerOrganisation: string; billingAddress: { line1: string; city: string } }
    mutable.customerOrganisation = 'Acme Holdings Ltd'
    mutable.billingAddress.line1 = '1 Somewhere Else'
    mutable.billingAddress.city = 'Sheffield'

    expect(snapshot.company).toBe('Acme Ltd')
    expect(snapshot.billingAddress).toContain('Accounts, 90 Example Street')
    expect(snapshot.billingAddress.join(' ')).not.toContain('Sheffield')
  })

  it('carries the customer reference their finance team matches against', () => {
    expect(buildCustomer(ORDER).reference).toBe('PO-4471')
  })
})
