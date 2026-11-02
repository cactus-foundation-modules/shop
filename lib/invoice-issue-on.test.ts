import { describe, it, expect } from 'vitest'
import { invoiceIssueOnForOrder, shouldIssueOn, stampInvoiceIssueOnChange } from './invoice-issue-on'

const switched = {
  invoicesEnabled: true,
  invoiceIssueOn: 'PAID' as const,
  invoiceIssueOnPrevious: 'COMPLETED' as const,
  invoiceIssueOnChangedAt: '2026-11-02T12:00:00.000Z',
}

describe('invoiceIssueOnForOrder', () => {
  it('keeps an order placed before the change on the old setting', () => {
    expect(invoiceIssueOnForOrder(switched, { createdAt: new Date('2026-10-20T09:00:00Z') })).toBe('COMPLETED')
  })
  it('puts an order placed after the change on the new setting', () => {
    expect(invoiceIssueOnForOrder(switched, { createdAt: new Date('2026-11-02T12:00:01Z') })).toBe('PAID')
  })
  it('uses the setting as it stands where it has never been changed', () => {
    const fresh = { ...switched, invoiceIssueOnPrevious: null, invoiceIssueOnChangedAt: null }
    expect(invoiceIssueOnForOrder(fresh, { createdAt: new Date('2020-01-01T00:00:00Z') })).toBe('PAID')
  })
})

describe('shouldIssueOn', () => {
  const oldOrder = { createdAt: '2026-10-20T09:00:00Z' }
  const newOrder = { createdAt: '2026-11-03T09:00:00Z' }
  it('invoices an old order on completion, not on payment', () => {
    expect(shouldIssueOn(switched, 'PAID', oldOrder)).toBe(false)
    expect(shouldIssueOn(switched, 'COMPLETED', oldOrder)).toBe(true)
  })
  it('invoices a new order on payment, not on completion', () => {
    expect(shouldIssueOn(switched, 'PAID', newOrder)).toBe(true)
    expect(shouldIssueOn(switched, 'COMPLETED', newOrder)).toBe(false)
  })
  it('raises nothing with invoicing off, and always allows the button', () => {
    expect(shouldIssueOn({ ...switched, invoicesEnabled: false }, 'PAID', newOrder)).toBe(false)
    expect(shouldIssueOn(switched, 'MANUAL', oldOrder)).toBe(true)
  })
})

describe('stampInvoiceIssueOnChange', () => {
  const now = new Date('2026-11-02T12:00:00.000Z')
  it('stamps the cut-over when the setting changes', () => {
    expect(stampInvoiceIssueOnChange({ invoiceIssueOn: 'PAID' }, { invoiceIssueOn: 'COMPLETED' }, now)).toEqual({
      invoiceIssueOn: 'PAID',
      invoiceIssueOnPrevious: 'COMPLETED',
      invoiceIssueOnChangedAt: '2026-11-02T12:00:00.000Z',
    })
  })
  it('leaves the cut-over alone when the setting is saved unchanged', () => {
    expect(stampInvoiceIssueOnChange({ invoiceIssueOn: 'PAID' }, { invoiceIssueOn: 'PAID' }, now)).toEqual({ invoiceIssueOn: 'PAID' })
  })
  it('never takes the cut-over from the browser', () => {
    const patch = { invoiceIssueOnPrevious: 'MANUAL' as const, invoiceIssueOnChangedAt: '2000-01-01T00:00:00Z' }
    expect(stampInvoiceIssueOnChange(patch, { invoiceIssueOn: 'PAID' }, now)).toEqual({})
  })
})
