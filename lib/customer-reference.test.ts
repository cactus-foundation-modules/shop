import { describe, expect, it } from 'vitest'
import {
  customerCanSetReference,
  customerReferenceLabel,
  customerReferenceOfferedAfterOrder,
} from '@/modules/shop/lib/customer-reference'
import { withOrderCustomerReference } from '@/modules/shop/lib/invoice-doc-context'
import type { ShpConfig } from '@/modules/shop/lib/config'
import type { ShpInvoice, ShpOrder } from '@/modules/shop/lib/types'

// The customer's own reference, added after the event.
//
// Two rules are worth pinning, because between them they are the whole feature:
//
//  - a reference added later PRINTS on paperwork that went out without one, or
//    the whole exercise buys the customer nothing; and
//  - it never rewrites a number a document was issued with, because an invoice
//    is a record of what was sent, not a field.

const on = {
  customerReferenceFieldEnabled: true,
  customerReferenceAfterOrder: true,
} as unknown as ShpConfig

const order = (status: string) => ({ status } as unknown as ShpOrder)

const invoice = (reference: string) => ({
  customer: { name: 'Jane Smith', reference },
} as unknown as ShpInvoice)

describe('customerCanSetReference', () => {
  it('lets a customer add one to a live order', () => {
    expect(customerCanSetReference({ config: on, order: order('PROCESSING') })).toEqual({ allowed: true })
  })

  it('refuses where the shop has not switched the box on', () => {
    const config = { ...on, customerReferenceAfterOrder: false }
    expect(customerCanSetReference({ config, order: order('PROCESSING') }).allowed).toBe(false)
  })

  it('refuses where the shop asks for no reference at all', () => {
    const config = { ...on, customerReferenceFieldEnabled: false }
    expect(customerCanSetReference({ config, order: order('PROCESSING') }).allowed).toBe(false)
  })

  it('refuses on a cancelled or refunded order', () => {
    expect(customerCanSetReference({ config: on, order: order('CANCELLED') }).allowed).toBe(false)
    expect(customerCanSetReference({ config: on, order: order('REFUNDED') }).allowed).toBe(false)
  })

  it('still allows it where an invoice went out with the box empty', () => {
    expect(customerCanSetReference({ config: on, order: order('COMPLETED'), invoiceReference: '  ' }))
      .toEqual({ allowed: true })
  })

  it('closes the box once an invoice has gone out carrying a number, and says which', () => {
    const outcome = customerCanSetReference({ config: on, order: order('COMPLETED'), invoiceReference: 'PO-4471' })
    expect(outcome.allowed).toBe(false)
    expect(outcome.allowed === false && outcome.reason).toContain('PO-4471')
  })
})

describe('customerReferenceOfferedAfterOrder', () => {
  it('needs both switches', () => {
    expect(customerReferenceOfferedAfterOrder(on)).toBe(true)
    expect(customerReferenceOfferedAfterOrder({ ...on, customerReferenceAfterOrder: false })).toBe(false)
    expect(customerReferenceOfferedAfterOrder({ ...on, customerReferenceFieldEnabled: false })).toBe(false)
  })
})

describe('customerReferenceLabel', () => {
  it('uses the shop wording, and falls back to what most shops mean', () => {
    expect(customerReferenceLabel({ customerReferenceLabel: 'Job reference' } as ShpConfig)).toBe('Job reference')
    expect(customerReferenceLabel({ customerReferenceLabel: '   ' } as ShpConfig)).toBe('Purchase order number')
  })
})

describe('withOrderCustomerReference', () => {
  it('prints a reference given after the invoice was raised', () => {
    expect(withOrderCustomerReference(invoice(''), 'PO-9001').customer.reference).toBe('PO-9001')
  })

  it('never overwrites the number the document was issued with', () => {
    expect(withOrderCustomerReference(invoice('PO-4471'), 'PO-9001').customer.reference).toBe('PO-4471')
  })

  it('leaves the document exactly as it was where there is nothing to fill in', () => {
    const doc = invoice('')
    expect(withOrderCustomerReference(doc, null)).toBe(doc)
    expect(withOrderCustomerReference(doc, '   ')).toBe(doc)
  })
})
