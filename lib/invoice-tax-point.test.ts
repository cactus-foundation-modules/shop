import { describe, it, expect } from 'vitest'
import { invoiceTaxPointDay } from '@/modules/shop/lib/invoice-tax-point'

describe('invoiceTaxPointDay', () => {
  it('is the payment day for a sale paid at checkout, whenever it is invoiced', () => {
    expect(invoiceTaxPointDay({ paidDay: '2026-03-30', despatchDay: '2026-04-02', issuedDay: '2026-04-02' })).toBe('2026-03-30')
    expect(invoiceTaxPointDay({ paidDay: '2026-03-30', despatchDay: '2026-04-02', issuedDay: '2026-06-20' })).toBe('2026-03-30')
  })

  it('keeps the payment day when it was paid the day it left', () => {
    expect(invoiceTaxPointDay({ paidDay: '2026-04-02', despatchDay: '2026-04-02', issuedDay: '2026-05-20' })).toBe('2026-04-02')
  })

  it('is the payment day, or failing that the invoice day, before anything has gone out', () => {
    expect(invoiceTaxPointDay({ paidDay: '2026-04-01', despatchDay: null, issuedDay: '2026-04-03' })).toBe('2026-04-01')
    expect(invoiceTaxPointDay({ paidDay: null, despatchDay: null, issuedDay: '2026-04-03' })).toBe('2026-04-03')
  })

  it('is the despatch day for an unpaid order invoiced as it goes', () => {
    expect(invoiceTaxPointDay({ paidDay: null, despatchDay: '2026-04-02', issuedDay: '2026-04-02' })).toBe('2026-04-02')
  })

  it('lets an invoice raised within 14 days of despatch carry its own date', () => {
    expect(invoiceTaxPointDay({ paidDay: null, despatchDay: '2026-03-25', issuedDay: '2026-04-08' })).toBe('2026-04-08')
  })

  it('falls back to the despatch day for an invoice raised later than that', () => {
    expect(invoiceTaxPointDay({ paidDay: null, despatchDay: '2026-03-25', issuedDay: '2026-04-09' })).toBe('2026-03-25')
  })

  it('ignores a payment that only arrived after the goods had gone', () => {
    // Paid a month after despatch and invoiced on payment: the goods left in
    // March, so March is when the sale happened.
    expect(invoiceTaxPointDay({ paidDay: '2026-04-25', despatchDay: '2026-03-25', issuedDay: '2026-04-25' })).toBe('2026-03-25')
    // Paid after despatch but invoiced inside the fortnight: the invoice's day.
    expect(invoiceTaxPointDay({ paidDay: '2026-03-28', despatchDay: '2026-03-25', issuedDay: '2026-03-30' })).toBe('2026-03-30')
  })

  it('treats a parcel recorded as leaving later than today as not gone yet', () => {
    expect(invoiceTaxPointDay({ paidDay: null, despatchDay: '2026-04-10', issuedDay: '2026-04-03' })).toBe('2026-04-03')
  })

  it('counts whole days across the clocks going forward', () => {
    // 29 March 2026 is the short day in London; 14 days is still 14 days.
    expect(invoiceTaxPointDay({ paidDay: null, despatchDay: '2026-03-20', issuedDay: '2026-04-03' })).toBe('2026-04-03')
    expect(invoiceTaxPointDay({ paidDay: null, despatchDay: '2026-03-20', issuedDay: '2026-04-04' })).toBe('2026-03-20')
  })
})
