import { describe, it, expect } from 'vitest'
import { chargeInvoiceMoney, chargeLinesToFold } from './charge-invoice'

const fee = { id: 'c1', status: 'PAID' as const, reason: 'Redelivery fee', netAmount: '25.00', taxRate: '20.000', taxAmount: '5.00', total: '30.00' }

describe('chargeInvoiceMoney', () => {
  it('is one line for the fee and nothing else, VAT exclusive', () => {
    const money = chargeInvoiceMoney({ taxMode: 'EXCLUSIVE' }, fee)
    expect(money.lines).toHaveLength(1)
    expect(money.lines[0]).toMatchObject({ name: 'Redelivery fee', quantity: 1, net: '25.00', tax: '5.00', gross: '30.00', taxRatePercent: '20' })
    expect(money).toMatchObject({ subtotal: '25.00', shippingAmount: '0.00', discountAmount: '0.00', taxAmount: '5.00', total: '30.00' })
    expect(money.taxBreakdown).toEqual([{ ratePercent: '20', net: '25.00', tax: '5.00', gross: '30.00' }])
  })

  it('prints the gross as the subtotal on a VAT-inclusive shop', () => {
    const money = chargeInvoiceMoney({ taxMode: 'INCLUSIVE' }, fee)
    expect(money.subtotal).toBe('30.00')
    expect(money.lines[0]).toMatchObject({ unitPrice: '30.00', lineTotal: '30.00' })
    expect(money.taxBreakdown).toEqual([{ ratePercent: '20', net: '25.00', tax: '5.00', gross: '30.00' }])
  })
})

describe('chargeLinesToFold', () => {
  it('never folds a charge that has its own invoice', () => {
    expect(chargeLinesToFold([fee], new Set(['c1']))).toEqual([])
  })
  it('keeps folding an old paid charge with no invoice of its own', () => {
    expect(chargeLinesToFold([fee], new Set())).toHaveLength(1)
  })
  it('ignores a charge that was not paid', () => {
    expect(chargeLinesToFold([{ ...fee, status: 'WAIVED' as const }], new Set())).toEqual([])
  })
})
