import type { ShpInvoice } from '@/modules/shop/lib/types'

// Context injected onto every invoice-document part-block before the layout
// renders, and the injector that puts it there. Same pattern as
// lib/inject-part-context.ts: the page loads the invoice once, attaches it by
// reference, and each part renders its own slice with no re-fetch.
//
// In the Puck editor canvas `_ctx` is undefined and each part draws a sample
// invoice instead - the canvas has no invoice, and an owner dragging blocks
// around needs to see the shape of the thing they are designing.

export type InvoiceDocContext = {
  invoice: ShpInvoice
  /** True while rendering for the PDF. Parts use it to drop anything that only
   *  makes sense on screen. */
  print: boolean
}

type PuckLikeData = { content?: unknown; zones?: Record<string, unknown>; root?: unknown }

const DOC_PART_TYPES = new Set([
  'ShopInvoiceHeader',
  'ShopInvoiceParties',
  'ShopInvoiceLines',
  'ShopInvoiceTotals',
  'ShopInvoiceTaxSummary',
  'ShopInvoicePayment',
])

function attach(blocks: unknown[], ctx: InvoiceDocContext): void {
  for (const item of blocks) {
    if (!item || typeof item !== 'object') continue
    const block = item as { type?: string; props?: Record<string, unknown> }
    if (block.type && block.props && DOC_PART_TYPES.has(block.type)) {
      block.props._ctx = ctx
    }
    if (block.props) {
      for (const [key, value] of Object.entries(block.props)) {
        // Recurse into nested slot arrays (Split/Section zones), but never into
        // the context just attached.
        if (key !== '_ctx' && Array.isArray(value)) attach(value, ctx)
      }
    }
  }
}

/** Clones the saved layout (pure JSON) and attaches the context by reference, so
 *  one object is shared by every part rather than serialised per block. */
export function injectInvoiceDocContext<T extends PuckLikeData>(data: T, ctx: InvoiceDocContext): T {
  const cloned = JSON.parse(JSON.stringify(data)) as T
  const content = Array.isArray(cloned.content) ? cloned.content : []
  const zoneBlocks = Object.values(cloned.zones ?? {}).flatMap((z) => (Array.isArray(z) ? z : []))
  attach([...content, ...zoneBlocks], ctx)
  return cloned
}

/** The sample invoice the editor canvas draws, so an owner designing the
 *  document sees a filled-in one rather than six empty boxes. Deliberately
 *  obvious placeholder data - nobody should mistake it for a real customer, and
 *  the VAT number is the one HMRC publishes for examples. */
export const SAMPLE_INVOICE_CONTEXT: InvoiceDocContext = {
  invoice: {
    id: 'sample',
    orderId: 'sample-order',
    orderNumber: 'ORD-000142',
    invoiceNumber: 'INV-000087',
    status: 'ISSUED',
    issuedAt: new Date('2026-04-06T09:00:00.000Z'),
    taxPointDate: '2026-04-06',
    dueDate: '2026-05-06',
    currency: 'GBP',
    currencySymbol: '£',
    taxMode: 'EXCLUSIVE',
    subtotal: '1512.00',
    discountAmount: '0.00',
    shippingAmount: '48.00',
    taxAmount: '312.00',
    total: '1872.00',
    seller: {
      name: 'Your business name',
      addressLines: ['12 Example Street', 'Leeds', 'LS1 1AA'],
      vatNumber: 'GB 123 4567 89',
      companyNumber: '01234567',
      email: 'accounts@example.com',
      phone: '0113 496 0000',
      siteName: 'Your shop',
      siteUrl: '',
      logoUrl: null,
    },
    customer: {
      name: 'Sample Customer',
      company: 'Sample Company Ltd',
      email: 'buyer@example.com',
      phone: '',
      billingAddress: ['Sample Customer', 'Sample Company Ltd', '4 Example Road', 'Manchester', 'M1 2AB'],
      shippingAddress: ['Sample Customer', 'Sample Company Ltd', '4 Example Road', 'Manchester', 'M1 2AB'],
    },
    lines: [
      {
        name: 'Oak desk 1600mm', sku: 'DSK-1600-OAK', quantity: 4,
        unitPrice: '249.00', lineTotal: '996.00', taxRatePercent: '20',
        net: '996.00', tax: '199.20', gross: '1195.20',
        detail: [{ label: 'Options', value: 'Oak / Silver legs' }],
      },
      {
        name: 'Task chair', sku: 'CHR-TASK-BLK', quantity: 4,
        unitPrice: '129.00', lineTotal: '516.00', taxRatePercent: '20',
        net: '516.00', tax: '103.20', gross: '619.20',
        detail: [],
      },
    ],
    taxBreakdown: [{ ratePercent: '20', net: '1560.00', tax: '312.00', gross: '1872.00' }],
    wording: {
      heading: 'Invoice',
      intro: '',
      taxLabel: 'VAT',
      paymentDetails: 'Bank transfer to Example Bank, sort code 00-00-00, account 12345678.',
      terms: 'Payment due within 30 days. Goods remain our property until paid for in full.',
      footer: '',
    },
    issuedBy: 'AUTO',
    issueTrigger: 'COMPLETED',
    createdByUserId: null,
    sinkResults: [],
    voidedAt: null,
    voidReason: null,
    createdAt: new Date('2026-04-06T09:00:00.000Z'),
    updatedAt: new Date('2026-04-06T09:00:00.000Z'),
  },
  print: false,
}
