import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShopInvoiceTotals } from '@/modules/shop/components/puck/invoice-parts'
import type { InvoiceDocContext } from '@/modules/shop/lib/invoice-doc-context'
import { SAMPLE_INVOICE_CONTEXT } from '@/modules/shop/lib/invoice-doc-context'
import type { ShpInvoiceLine } from '@/modules/shop/lib/types'

// A shop that prices delivery per item - the advanced shipping module's per-line
// service - charges it INSIDE the line price and leaves the order's own
// `shippingAmount` at nought. Every document then read that nought, and a layout
// set to print the delivery row anyway told the customer their delivery was
// "Free" on the very document asking them to pay for it. On a proforma, which is
// read by somebody deciding whether to send the money, that is the worst place
// in the shop for it to happen.
//
// So the charges the lines carry are what the delivery rows are made of, and the
// zero-carriage wording only speaks when there is genuinely no delivery money on
// the document at all.

function line(overrides: Partial<ShpInvoiceLine> = {}): ShpInvoiceLine {
  return {
    name: 'Oak desk', sku: 'DSK-1', quantity: 1,
    unitPrice: '216.95', lineTotal: '216.95', taxRatePercent: '20',
    net: '216.95', tax: '43.39', gross: '260.34', detail: [],
    ...overrides,
  }
}

function ctx(lines: ShpInvoiceLine[], overrides: Record<string, string> = {}): InvoiceDocContext {
  return {
    ...SAMPLE_INVOICE_CONTEXT,
    invoice: {
      ...SAMPLE_INVOICE_CONTEXT.invoice,
      subtotal: '216.95', shippingAmount: '0.00', taxAmount: '43.39', total: '260.34',
      lines, taxBreakdown: [{ ratePercent: '20', net: '216.95', tax: '43.39', gross: '260.34' }],
      ...overrides,
    },
  }
}

/** The document's money column as plain text, so a row can be asserted on
 *  without pinning the markup around it. */
function totals(context: InvoiceDocContext, props: Record<string, unknown> = {}): string {
  const html = renderToStaticMarkup(
    <ShopInvoiceTotals
      _ctx={context}
      showDeliveryRow="always"
      zeroDelivery="Free"
      deliveryLabel="Delivery ex VAT"
      subtotalLabel="Subtotal ex VAT"
      showPaid="no"
      {...props}
    />,
  )
  return html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

describe('the delivery row on an invoice, proforma or credit note', () => {
  it('prints what a per-item delivery service actually charged, not "Free"', () => {
    const text = totals(ctx([line({ charges: [{ label: 'Delivery', amount: '25.95' }] })]))
    expect(text).toContain('Delivery £25.95')
    expect(text).not.toContain('Free')
  })

  it('takes the charge out of the subtotal, so the column still adds up', () => {
    const text = totals(ctx([line({ charges: [{ label: 'Delivery', amount: '25.95' }] })]))
    // 216.95 of line money, 25.95 of it delivery: goods 191.00, and the total
    // underneath is untouched.
    expect(text).toContain('Subtotal ex VAT £191.00')
    expect(text).toContain('Total £260.34')
  })

  it('sums the same charge across every line it appears on', () => {
    const text = totals(ctx([
      line({ charges: [{ label: 'Delivery', amount: '25.95' }] }),
      line({ charges: [{ label: 'Delivery', amount: '17.95' }] }),
    ], { subtotal: '433.90' }))
    expect(text).toContain('Delivery £43.90')
  })

  it('still reassures the customer where delivery really was free', () => {
    const text = totals(ctx([line()]))
    expect(text).toContain('Delivery ex VAT Free')
    expect(text).toContain('Subtotal ex VAT £216.95')
  })

  it('leaves an order-level carriage rate exactly as it was', () => {
    const text = totals(ctx([line()], { shippingAmount: '12.50' }))
    expect(text).toContain('Delivery ex VAT £12.50')
  })

  it('prints both where a shop charges carriage AND a per-item service', () => {
    const text = totals(ctx([line({ charges: [{ label: 'Delivery', amount: '25.95' }] })], { shippingAmount: '12.50' }))
    expect(text).toContain('Delivery £25.95')
    expect(text).toContain('Delivery ex VAT £12.50')
  })

  it('leaves a document raised before charges were recorded alone', () => {
    const text = totals(ctx([line({ charges: null })]))
    expect(text).toContain('Subtotal ex VAT £216.95')
    expect(text).toContain('Delivery ex VAT Free')
  })
})
