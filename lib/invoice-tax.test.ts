import { describe, expect, it } from 'vitest'
import { buildInvoiceMoney, formatRatePercent, ledgerItems } from '@/modules/shop/lib/invoice-tax'
import type { ShpInvoiceLine, ShpInvoiceTaxRow, ShpOrder, ShpOrderItem } from '@/modules/shop/lib/types'

// An invoice is the one document in the shop that somebody else audits. The
// failure mode is quiet: a VAT summary a penny out from the payment, or a
// discounted order whose net figures do not add back to what was charged,
// looks perfectly fine on screen and comes back from an accountant in January.
// So the arithmetic is pinned here rather than trusted.

function order(overrides: Partial<ShpOrder> = {}): ShpOrder {
  return {
    id: 'ord_1', orderNumber: 'ORD-000001', status: 'COMPLETED', memberId: null,
    customerEmail: 'a@example.com', customerName: 'A Customer', customerPhone: null,
    shippingAddress: { firstName: 'A', lastName: 'Customer', line1: '1 Road', city: 'Leeds', postcode: 'LS1 1AA', country: 'GB' },
    billingAddress: null,
    subtotal: '1000.00', discountAmount: '0.00', shippingAmount: '0.00', taxAmount: '200.00', total: '1200.00',
    taxMode: 'EXCLUSIVE', currency: 'GBP', couponId: null, couponCode: null,
    paymentMethod: 'STRIPE', paymentStatus: 'PAID', paymentReference: null, paidAt: null,
    shippingRateId: null, shippingRateName: null, agreements: null,
    notifyEmail: true, notifySms: false, notifyPhone: null,
    createdAt: new Date(0), updatedAt: new Date(0),
    ...overrides,
  } as ShpOrder
}

function item(overrides: Partial<ShpOrderItem> = {}): ShpOrderItem {
  return {
    id: 'itm_1', orderId: 'ord_1', productId: 'prd_1', productName: 'Oak desk', productSku: 'DSK-1',
    productType: 'PHYSICAL', quantity: 1, unitPrice: '1000.00', taxRate: '0.2000',
    taxAmount: '200.00', total: '1000.00', refundedQty: 0, isPreOrder: false,
    preOrderDispatchDate: null, lineMeta: null,
    ...overrides,
  } as ShpOrderItem
}

describe('formatRatePercent', () => {
  it('prints whole rates without decimals', () => {
    expect(formatRatePercent(0.2)).toBe('20')
  })

  it('keeps a fractional rate', () => {
    expect(formatRatePercent(0.175)).toBe('17.5')
  })

  it('prints zero-rated as 0', () => {
    expect(formatRatePercent(0)).toBe('0')
  })
})

describe('buildInvoiceMoney - EXCLUSIVE shop (Deskwell)', () => {
  it('nets, taxes and grosses one line', () => {
    const { lines, taxBreakdown } = buildInvoiceMoney(order(), [item()])
    expect(lines[0]).toMatchObject({ net: '1000.00', tax: '200.00', gross: '1200.00', lineTotal: '1000.00', taxRatePercent: '20' })
    expect(taxBreakdown).toEqual([{ ratePercent: '20', net: '1000.00', tax: '200.00', gross: '1200.00' }])
  })

  it('adds delivery into the rate it was charged at', () => {
    const o = order({ shippingAmount: '50.00', taxAmount: '210.00', total: '1260.00' })
    const { taxBreakdown } = buildInvoiceMoney(o, [item()])
    expect(taxBreakdown).toEqual([{ ratePercent: '20', net: '1050.00', tax: '210.00', gross: '1260.00' }])
  })

  it('splits a mixed-rate basket into a row each, delivery apportioned by value', () => {
    // £300 at 20% and £100 at 0%, £40 delivery. Delivery follows the mix, so
    // £30 of it is rated 20% (£6) and £10 of it zero-rated.
    const o = order({ subtotal: '400.00', shippingAmount: '40.00', taxAmount: '66.00', total: '506.00' })
    const items = [
      item({ id: 'a', productName: 'Desk', unitPrice: '300.00', total: '300.00', taxRate: '0.2000', taxAmount: '60.00' }),
      item({ id: 'b', productName: 'Book', unitPrice: '100.00', total: '100.00', taxRate: '0.0000', taxAmount: '0.00' }),
    ]
    expect(buildInvoiceMoney(o, items).taxBreakdown).toEqual([
      { ratePercent: '20', net: '330.00', tax: '66.00', gross: '396.00' },
      { ratePercent: '0', net: '110.00', tax: '0.00', gross: '110.00' },
    ])
  })

  it('apportions an order-level discount across the lines but leaves the line totals alone', () => {
    // 10% off a £1,000 basket: £900 taxed, £180 VAT.
    const o = order({ discountAmount: '100.00', taxAmount: '180.00', total: '1080.00' })
    const { lines, taxBreakdown } = buildInvoiceMoney(o, [item({ taxAmount: '180.00' })])
    // The line still shows its own arithmetic - quantity times price.
    expect(lines[0]!.lineTotal).toBe('1000.00')
    // ...while the taxed share is the discounted one.
    expect(lines[0]).toMatchObject({ net: '900.00', tax: '180.00', gross: '1080.00' })
    expect(taxBreakdown).toEqual([{ ratePercent: '20', net: '900.00', tax: '180.00', gross: '1080.00' }])
  })
})

describe('buildInvoiceMoney - INCLUSIVE shop', () => {
  it('extracts the tax already inside the price', () => {
    const o = order({ taxMode: 'INCLUSIVE', subtotal: '1200.00', taxAmount: '200.00', total: '1200.00' })
    const i = item({ unitPrice: '1200.00', total: '1200.00', taxAmount: '200.00' })
    const { lines, taxBreakdown } = buildInvoiceMoney(o, [i])
    expect(lines[0]).toMatchObject({ net: '1000.00', tax: '200.00', gross: '1200.00' })
    expect(taxBreakdown).toEqual([{ ratePercent: '20', net: '1000.00', tax: '200.00', gross: '1200.00' }])
  })

  it('keeps delivery inside the total rather than adding to it', () => {
    const o = order({ taxMode: 'INCLUSIVE', subtotal: '1200.00', shippingAmount: '60.00', taxAmount: '210.00', total: '1260.00' })
    const i = item({ unitPrice: '1200.00', total: '1200.00', taxAmount: '200.00' })
    expect(buildInvoiceMoney(o, [i]).taxBreakdown).toEqual([
      { ratePercent: '20', net: '1050.00', tax: '210.00', gross: '1260.00' },
    ])
  })
})

describe('buildInvoiceMoney - it always ties to the payment', () => {
  it('absorbs apportionment rounding so the summary equals the order', () => {
    // Three lines at an awkward split with a discount that does not divide
    // cleanly: the per-row figures cannot all round to the charged total on
    // their own, so the largest row takes the difference.
    const o = order({ subtotal: '99.99', discountAmount: '33.33', shippingAmount: '4.99', taxAmount: '14.27', total: '85.92' })
    const items = [
      item({ id: 'a', unitPrice: '33.33', total: '33.33', taxAmount: '4.44' }),
      item({ id: 'b', unitPrice: '33.33', total: '33.33', taxAmount: '4.45' }),
      item({ id: 'c', unitPrice: '33.33', total: '33.33', taxAmount: '4.45' }),
    ]
    const { taxBreakdown } = buildInvoiceMoney(o, items)
    const sumTax = taxBreakdown.reduce((sum, row) => sum + Number(row.tax), 0)
    const sumGross = taxBreakdown.reduce((sum, row) => sum + Number(row.gross), 0)
    expect(Math.round(sumTax * 100) / 100).toBe(14.27)
    expect(Math.round(sumGross * 100) / 100).toBe(85.92)
  })

  it('handles a shop with no tax rates at all', () => {
    const o = order({ taxAmount: '0.00', total: '1000.00' })
    const { taxBreakdown } = buildInvoiceMoney(o, [item({ taxRate: '0.0000', taxAmount: '0.00' })])
    expect(taxBreakdown).toEqual([{ ratePercent: '0', net: '1000.00', tax: '0.00', gross: '1000.00' }])
  })

  it('gives delivery a row of its own when there is nothing else on the order', () => {
    const o = order({ subtotal: '0.00', shippingAmount: '10.00', taxAmount: '2.00', total: '12.00' })
    const { taxBreakdown } = buildInvoiceMoney(o, [])
    expect(taxBreakdown).toEqual([{ ratePercent: '20', net: '10.00', tax: '2.00', gross: '12.00' }])
  })
})

describe('buildInvoiceMoney - what goes on a line beyond the money', () => {
  it('keeps personalisation but drops the delivery promise', () => {
    // The batch names the field it restates (LineMeta.fieldLabel). That field is
    // a promise about a date in the future; an invoice is read months later.
    const withMeta = item({
      lineMeta: {
        fields: [
          { label: 'Delivery', value: 'Flat-Pack - by Wednesday 2nd of September' },
          { label: 'Engraving', value: 'For Dad' },
        ],
        batch: { id: '2026-09-02', sort: '2026-09-02', heading: 'Arrives by Wednesday', fieldLabel: 'Delivery' },
      },
    })
    const { lines } = buildInvoiceMoney(order(), [withMeta])
    expect(lines[0]!.detail).toEqual([{ label: 'Engraving', value: 'For Dad' }])
  })

  it('keeps every field when no batch says which one is the delivery', () => {
    const withMeta = item({
      lineMeta: { fields: [{ label: 'Delivery', value: 'Next week' }] },
    })
    const { lines } = buildInvoiceMoney(order(), [withMeta])
    expect(lines[0]!.detail).toEqual([{ label: 'Delivery', value: 'Next week' }])
  })

  it('keeps the delivery promise for a proforma, which is read before the money moves', () => {
    // The one document that wants it. A proforma is read by somebody deciding
    // whether to pay, and the lead time per line is the thing they are weighing
    // up - so dropping it there would take away the answer to the question the
    // document exists to be asked.
    const withMeta = item({
      lineMeta: {
        fields: [
          { label: 'Delivery', value: 'Flat-Pack - 5 working days from when your payment reaches us' },
          { label: 'Engraving', value: 'For Dad' },
        ],
        batch: { id: 'unpaid', sort: 'unpaid', heading: 'Once payment clears', fieldLabel: 'Delivery' },
      },
    })
    const { lines } = buildInvoiceMoney(order(), [withMeta], { keepDeliveryDetail: true })
    expect(lines[0]!.detail).toEqual([
      { label: 'Delivery', value: 'Flat-Pack - 5 working days from when your payment reaches us' },
      { label: 'Engraving', value: 'For Dad' },
    ])
  })
})

// What goes over the bookkeeping seam. The rule that matters is not "does it
// itemise" but "does it tie": an entry built from these rows must come to the
// same money as the invoice, or it is a wrong VAT return dressed up as detail.

function invLine(overrides: Partial<ShpInvoiceLine> = {}): ShpInvoiceLine {
  return {
    name: 'Oak desk', sku: 'DSK-1', quantity: 1, unitPrice: '1000.00', lineTotal: '1000.00',
    taxRatePercent: '20', net: '1000.00', tax: '200.00', gross: '1200.00', detail: [],
    orderItemId: 'itm_1',
    ...overrides,
  }
}

function sums(rows: { net: string; tax: string; gross: string }[]) {
  return rows.reduce(
    (acc, row) => ({
      net: Math.round((acc.net + Number(row.net)) * 100) / 100,
      tax: Math.round((acc.tax + Number(row.tax)) * 100) / 100,
      gross: Math.round((acc.gross + Number(row.gross)) * 100) / 100,
    }),
    { net: 0, tax: 0, gross: 0 },
  )
}

describe('ledgerItems', () => {
  it('names each line, with its quantity and SKU', () => {
    const breakdown: ShpInvoiceTaxRow[] = [{ ratePercent: '20', net: '1000.00', tax: '200.00', gross: '1200.00' }]
    expect(ledgerItems([invLine()], breakdown)).toEqual([
      { description: 'Oak desk (DSK-1)', ratePercent: '20', net: '1000.00', tax: '200.00', gross: '1200.00' },
    ])
  })

  it('puts the quantity in front when more than one was bought', () => {
    const breakdown: ShpInvoiceTaxRow[] = [{ ratePercent: '20', net: '2000.00', tax: '400.00', gross: '2400.00' }]
    const items = ledgerItems([invLine({ quantity: 2, net: '2000.00', tax: '400.00', gross: '2400.00' })], breakdown)
    expect(items[0]!.description).toBe('2 x Oak desk (DSK-1)')
  })

  it('gives delivery a row of its own, so the rows tie to the summary', () => {
    // The invoice's own shape: delivery is rated into the bucket and never
    // appears as a line, so without a row for it the items are 60.00 short.
    const breakdown: ShpInvoiceTaxRow[] = [{ ratePercent: '20', net: '1050.00', tax: '210.00', gross: '1260.00' }]
    const items = ledgerItems([invLine()], breakdown, { carriageLabel: 'Delivery' })
    expect(items).toHaveLength(2)
    expect(items[1]).toEqual({ description: 'Delivery', ratePercent: '20', net: '50.00', tax: '10.00', gross: '60.00' })
    expect(sums(items)).toEqual(sums(breakdown))
  })

  it('calls a leftover penny rounding when there is no delivery to explain it', () => {
    const breakdown: ShpInvoiceTaxRow[] = [{ ratePercent: '20', net: '1000.01', tax: '200.00', gross: '1200.01' }]
    const items = ledgerItems([invLine()], breakdown)
    expect(items[1]).toMatchObject({ description: 'Rounding', net: '0.01', gross: '0.01' })
    expect(sums(items)).toEqual(sums(breakdown))
  })

  it('calls a negative leftover rounding rather than negative delivery', () => {
    const breakdown: ShpInvoiceTaxRow[] = [{ ratePercent: '20', net: '999.99', tax: '200.00', gross: '1199.99' }]
    const items = ledgerItems([invLine()], breakdown, { carriageLabel: 'Delivery' })
    expect(items[1]).toMatchObject({ description: 'Rounding', net: '-0.01', gross: '-0.01' })
    expect(sums(items)).toEqual(sums(breakdown))
  })

  it('keeps a mixed-rate basket on its own rates', () => {
    const lines = [
      invLine(),
      invLine({ name: 'Book', sku: 'BK-1', taxRatePercent: '0', net: '20.00', tax: '0.00', gross: '20.00', orderItemId: 'itm_2' }),
    ]
    const breakdown: ShpInvoiceTaxRow[] = [
      { ratePercent: '20', net: '1000.00', tax: '200.00', gross: '1200.00' },
      { ratePercent: '0', net: '20.00', tax: '0.00', gross: '20.00' },
    ]
    const items = ledgerItems(lines, breakdown)
    expect(items.map((i) => [i.description, i.ratePercent])).toEqual([
      ['Oak desk (DSK-1)', '20'],
      ['Book (BK-1)', '0'],
    ])
    expect(sums(items)).toEqual(sums(breakdown))
  })

  it('drops a line that came to nothing', () => {
    const lines = [invLine(), invLine({ name: 'Freebie', net: '0.00', tax: '0.00', gross: '0.00', orderItemId: 'itm_2' })]
    const breakdown: ShpInvoiceTaxRow[] = [{ ratePercent: '20', net: '1000.00', tax: '200.00', gross: '1200.00' }]
    expect(ledgerItems(lines, breakdown)).toHaveLength(1)
  })

  it('hands back nothing at all when a line is at a rate the summary never heard of', () => {
    const lines = [invLine({ taxRatePercent: '5' })]
    const breakdown: ShpInvoiceTaxRow[] = [{ ratePercent: '20', net: '1000.00', tax: '200.00', gross: '1200.00' }]
    expect(ledgerItems(lines, breakdown)).toEqual([])
  })

  it('hands back nothing for a document with no lines on it', () => {
    expect(ledgerItems([], [])).toEqual([])
  })

  it('hands back nothing rather than filing a whole invoice as "Rounding"', () => {
    // An invoice raised before lines were snapshotted. Every penny of it would
    // otherwise come out as one leftover row.
    const breakdown: ShpInvoiceTaxRow[] = [{ ratePercent: '20', net: '1000.00', tax: '200.00', gross: '1200.00' }]
    expect(ledgerItems([], breakdown, { carriageLabel: 'Delivery' })).toEqual([])
  })

  it('hands back nothing when every line came to nothing', () => {
    const breakdown: ShpInvoiceTaxRow[] = [{ ratePercent: '20', net: '50.00', tax: '10.00', gross: '60.00' }]
    const zeroed = [invLine({ net: '0.00', tax: '0.00', gross: '0.00' })]
    expect(ledgerItems(zeroed, breakdown, { carriageLabel: 'Delivery' })).toEqual([])
  })

  it('ties on a real invoice with a discount and delivery on it', () => {
    const o = order({
      subtotal: '1000.00', discountAmount: '100.00', shippingAmount: '50.00',
      taxAmount: '190.00', total: '1140.00',
    })
    const { lines, taxBreakdown } = buildInvoiceMoney(o, [item({ taxAmount: '180.00' })])
    const items = ledgerItems(lines, taxBreakdown, { carriageLabel: 'Delivery' })
    expect(items.length).toBeGreaterThan(0)
    expect(sums(items)).toEqual(sums(taxBreakdown))
  })
})
