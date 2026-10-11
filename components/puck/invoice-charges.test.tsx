import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShopInvoiceLines, ShopInvoiceTotals } from '@/modules/shop/components/puck/invoice-parts'
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
// So each charge a line carries is printed as a row of its own under that line
// in the items table - its own unit price, quantity and amount - and the
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

/** The items table as plain text, the same way. */
function items(context: InvoiceDocContext): string {
  const html = renderToStaticMarkup(<ShopInvoiceLines _ctx={context} />)
  return html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

describe('the delivery on an invoice, proforma or credit note', () => {
  it('prints a per-item delivery service as its own priced row under the line', () => {
    const text = items(ctx([line({ quantity: 2, unitPrice: '108.475', lineTotal: '216.95', charges: [{ label: 'Delivery', amount: '25.95' }] })]))
    // Goods: 216.95 less 25.95 of delivery = 191.00, or 95.50 each.
    expect(text).toContain('Oak desk')
    expect(text).toContain('2 £95.50 £191.00')
    // Delivery: 25.95 over two of them.
    expect(text).toContain('Delivery 2 £12.98 £25.95')
  })

  it('names the service on the delivery row, not in the line detail as well', () => {
    const text = items(ctx([line({
      detail: [{ label: 'Delivery', value: 'Kerbside' }],
      charges: [{ label: 'Delivery', amount: '25.95' }],
    })]))
    expect(text).toContain('Delivery: Kerbside 1 £25.95 £25.95')
    expect(text).not.toContain('Delivery: Kerbside Delivery')
  })

  it('does not repeat it in the totals, nor call delivery free', () => {
    const text = totals(ctx([line({ charges: [{ label: 'Delivery', amount: '25.95' }] })]))
    // The subtotal is the lines as listed, delivery rows included, and the
    // total underneath is untouched.
    expect(text).toContain('Subtotal ex VAT £216.95')
    expect(text).not.toContain('Delivery £25.95')
    expect(text).not.toContain('Free')
    expect(text).toContain('Total £260.34')
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

  it('keeps the carriage row where a shop charges carriage AND a per-item service', () => {
    const context = ctx([line({ charges: [{ label: 'Delivery', amount: '25.95' }] })], { shippingAmount: '12.50' })
    expect(items(context)).toContain('Delivery 1 £25.95 £25.95')
    expect(totals(context)).toContain('Delivery ex VAT £12.50')
  })

  it('leaves a document raised before charges were recorded alone', () => {
    const text = totals(ctx([line({ charges: null })]))
    expect(text).toContain('Subtotal ex VAT £216.95')
    expect(text).toContain('Delivery ex VAT Free')
  })
})
