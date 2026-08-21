import { describe, expect, it } from 'vitest'
import { CreditNoteMoneyError, buildCreditNoteMoney } from '@/modules/shop/lib/credit-note-tax'
import type { ShpInvoiceLine } from '@/modules/shop/lib/types'

// A credit note is read beside the invoice it undoes, by the customer and by
// whoever files the VAT. Both failure modes are quiet: a credit that hands back
// the right cash but the wrong VAT overstates a return by exactly the
// difference, and a summary a penny out from the refund is the sort of thing an
// accountant sends back in January. So the arithmetic is pinned here.

function line(overrides: Partial<ShpInvoiceLine> = {}): ShpInvoiceLine {
  return {
    name: 'Oak desk 1600mm',
    sku: 'DSK-1600-OAK',
    quantity: 2,
    unitPrice: '218.00',
    lineTotal: '436.00',
    taxRatePercent: '20',
    net: '436.00',
    tax: '87.20',
    gross: '523.20',
    detail: [],
    orderItemId: 'item-1',
    ...overrides,
  }
}

describe('buildCreditNoteMoney', () => {
  it('credits the money that went back, and finds the VAT inside it', () => {
    const money = buildCreditNoteMoney([line()], ['item-1'], [{ orderItemId: 'item-1', quantity: 1, amount: 261.6 }], 'EXCLUSIVE')

    expect(money.total).toBe('261.60')
    expect(money.taxAmount).toBe('43.60')
    expect(money.subtotal).toBe('218.00')
    expect(money.lines).toHaveLength(1)
    expect(money.lines[0]!.gross).toBe('261.60')
    expect(money.lines[0]!.net).toBe('218.00')
    expect(money.lines[0]!.unitPrice).toBe('261.60')
  })

  it('credits a partial amount proportionally', () => {
    // Half the line back, so half the VAT with it.
    const money = buildCreditNoteMoney([line()], ['item-1'], [{ orderItemId: 'item-1', quantity: 1, amount: 130.8 }], 'EXCLUSIVE')
    expect(money.total).toBe('130.80')
    expect(money.taxAmount).toBe('21.80')
  })

  it('carries an INCLUSIVE shop through the same division', () => {
    // Prices already carry the tax: gross 523.20 of which 87.20 is VAT.
    const inclusive = line({ unitPrice: '261.60', lineTotal: '523.20', net: '436.00', tax: '87.20', gross: '523.20' })
    const money = buildCreditNoteMoney([inclusive], ['item-1'], [{ orderItemId: 'item-1', quantity: 2, amount: 523.2 }], 'INCLUSIVE')
    expect(money.total).toBe('523.20')
    expect(money.taxAmount).toBe('87.20')
    // An INCLUSIVE shop's subtotal already carries the tax, exactly as its
    // invoice prints it.
    expect(money.subtotal).toBe('523.20')
  })

  it('keeps a zero-rated line at zero rather than lending it VAT', () => {
    const zero = line({ orderItemId: 'item-2', taxRatePercent: '0', net: '100.00', tax: '0.00', gross: '100.00' })
    const money = buildCreditNoteMoney(
      [line(), zero],
      ['item-1', 'item-2'],
      [
        { orderItemId: 'item-1', quantity: 1, amount: 261.6 },
        { orderItemId: 'item-2', quantity: 1, amount: 100 },
      ],
      'EXCLUSIVE',
    )
    expect(money.total).toBe('361.60')
    expect(money.taxAmount).toBe('43.60')
    const rows = Object.fromEntries(money.taxBreakdown.map((r) => [r.ratePercent, r]))
    expect(rows['20']!.tax).toBe('43.60')
    expect(rows['0']!.tax).toBe('0.00')
    expect(rows['0']!.gross).toBe('100.00')
  })

  it('sums the rate rows exactly to the credit', () => {
    // Amounts chosen to leave rounding dust in the buckets.
    const a = line({ orderItemId: 'a', taxRatePercent: '20', net: '10.00', tax: '2.00', gross: '12.00' })
    const b = line({ orderItemId: 'b', taxRatePercent: '5', net: '10.00', tax: '0.50', gross: '10.50' })
    const money = buildCreditNoteMoney(
      [a, b],
      ['a', 'b'],
      [
        { orderItemId: 'a', quantity: 1, amount: 3.33 },
        { orderItemId: 'b', quantity: 1, amount: 3.33 },
      ],
      'EXCLUSIVE',
    )
    const sumTax = money.taxBreakdown.reduce((sum, r) => sum + Number(r.tax), 0)
    const sumGross = money.taxBreakdown.reduce((sum, r) => sum + Number(r.gross), 0)
    expect(sumTax.toFixed(2)).toBe(money.taxAmount)
    expect(sumGross.toFixed(2)).toBe(money.total)
  })

  it('falls back to position for an invoice raised before line ids existed', () => {
    const legacy = line({ orderItemId: undefined })
    const money = buildCreditNoteMoney([legacy], ['item-1'], [{ orderItemId: 'item-1', quantity: 1, amount: 261.6 }], 'EXCLUSIVE')
    expect(money.taxAmount).toBe('43.60')
  })

  it('refuses rather than guessing when the line is not on the invoice', () => {
    expect(() =>
      buildCreditNoteMoney([line()], ['item-1'], [{ orderItemId: 'nowhere', quantity: 1, amount: 10 }], 'EXCLUSIVE'),
    ).toThrow(CreditNoteMoneyError)
  })

  it('handles a line that carried no tax at all without dividing by zero', () => {
    const free = line({ orderItemId: 'free', net: '0.00', tax: '0.00', gross: '0.00' })
    const money = buildCreditNoteMoney([free], ['free'], [{ orderItemId: 'free', quantity: 1, amount: 5 }], 'EXCLUSIVE')
    expect(money.total).toBe('5.00')
    expect(money.taxAmount).toBe('0.00')
  })
})
