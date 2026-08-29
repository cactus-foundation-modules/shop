import { injectDocumentContext, type PuckLikeData } from '@/lib/documents/context'
import type { ShpCreditNote, ShpInvoice } from '@/modules/shop/lib/types'

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
  /** Whether the money has arrived, where the document knows.
   *
   *  Not on the invoice itself, and deliberately not: an invoice is a snapshot
   *  taken when it was raised, and whether it has since been paid is a fact
   *  about the ORDER. The blocks need it all the same - a paid invoice has no
   *  business printing bank details - so it is gathered by whoever loads the
   *  document and handed over here.
   *
   *  Undefined means "not known", which is what the editor canvas and any older
   *  caller sees, and every block treats that as unpaid so nothing disappears
   *  from a document that cannot say. */
  paid?: boolean
  /** Set when the document being drawn is a credit note rather than an invoice.
   *
   *  A credit note is drawn by these same six blocks on this same layout, so an
   *  owner who has spent an afternoon on their invoice gets a matching credit
   *  note for nothing. What differs is small enough to live here: the document
   *  needs its own number printed above the invoice it credits, and the line
   *  under the total says the money went back rather than that it came in.
   *
   *  Everything else - the figures, which are positive magnitudes on both - is
   *  identical, which is why the money blocks need no branch at all. */
  credit?: CreditDocMeta
  /** Set when the document being drawn is a proforma rather than an invoice.
   *
   *  Same trick as `credit` above, and for the same reason: a proforma is the
   *  invoice's blocks on a layout type of its own, so an owner who has designed
   *  one document has very nearly designed the other. What differs is whether
   *  the money has arrived - the one thing the blocks cannot work out from an
   *  invoice-shaped object, and the thing the line under the total has to say.
   *
   *  Note what is NOT here: a document number. A proforma carries the ORDER's
   *  own number, which is already on the object twice over, so no invoice number
   *  is burned and no gap appears in the invoice sequence for a document that is
   *  not one. */
  proforma?: ProformaDocMeta
}

/** The little a proforma needs beyond an invoice's own fields. */
export type ProformaDocMeta = {
  /** Whether the money has arrived. Decides the line under the total, and
   *  nothing else - the figures are the same either way. */
  paid: boolean
}

/** The little a credit note needs beyond an invoice's own fields. */
export type CreditDocMeta = {
  creditNoteNumber: string
  /** Why the money went back, where somebody said. */
  reason: string | null
}

// Every block that reads the invoice. The style block and the divider are not
// here on purpose: neither prints a figure, so neither needs the document, and
// attaching it to them would only make the injected tree bigger.
const DOC_PART_TYPES = [
  'ShopInvoiceHeader',
  'ShopInvoiceParties',
  'ShopInvoiceFrom',
  'ShopInvoiceTo',
  'ShopInvoicePageNumber',
  'ShopInvoiceLines',
  'ShopInvoiceTotals',
  'ShopInvoiceTaxSummary',
  'ShopInvoicePayment',
  'ShopInvoiceNotice',
  'ShopInvoiceFooter',
]

/**
 * The document with the ORDER's customer reference filled in, where the document
 * itself was raised without one.
 *
 * A business buyer very often has no purchase order number on the day they buy -
 * their own finance team raises it the week after - and an invoice arriving
 * without that number sits in a tray rather than getting paid. So a reference
 * added to the order afterwards is printed on the paperwork that went out with
 * the box empty.
 *
 * Note what this does NOT do: it never overwrites a reference the document was
 * issued with. The snapshot is the record of what was sent, and this module has
 * never rewritten one - a wrong invoice is voided and reissued, not quietly
 * edited under the person holding it. Filling a blank contradicts nothing;
 * changing a number somebody has already filed would. The same rule stops the
 * customer editing theirs once it is on an issued invoice - see
 * lib/customer-reference.ts.
 */
export function withOrderCustomerReference<T extends ShpInvoice>(invoice: T, reference: string | null | undefined): T {
  const own = invoice.customer?.reference?.trim()
  const fallback = reference?.trim()
  if (own || !fallback) return invoice
  return { ...invoice, customer: { ...invoice.customer, reference: fallback } }
}

/** Clones the saved layout (pure JSON) and attaches the context by reference, so
 *  one object is shared by every part rather than serialised per block.
 *
 *  The walk itself is core's (lib/documents/context.ts) - it was written here,
 *  then written again in Quote for Shop, and would have been written a third
 *  time by the next module to print anything. What stays here is the only part
 *  that is the shop's: which blocks read an invoice. */
export function injectInvoiceDocContext<T extends PuckLikeData>(data: T, ctx: InvoiceDocContext): T {
  return injectDocumentContext(data, ctx, DOC_PART_TYPES)
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
      reference: 'PO-4471',
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
      customerReferenceLabel: 'Purchase order number',
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

/**
 * A credit note as the document blocks want it.
 *
 * The blocks are typed to an invoice because that is what they were written for
 * and what the editor canvas previews; a credit note carries every one of those
 * fields already (same seller, same customer, same line and rate shapes), so it
 * is presented as one rather than the six blocks each learning about a second
 * type.
 *
 * Two fields are worth pointing at:
 *
 *  - `invoiceNumber` is the CREDITED invoice's, not the credit note's. That is
 *    what belongs in the header's "Invoice" row - the reference tying the two
 *    documents together, which is the thing a credit note must carry. Its own
 *    number rides on `credit` and is printed above it.
 *
 *  - `dueDate` is null, always. Nothing on a credit note falls due.
 */
export function creditNoteDocContext(
  note: ShpCreditNote,
  opts?: {
    print?: boolean
    /** The order's reference as it stands today, for a credit note raised
     *  before the customer gave one. See withOrderCustomerReference. */
    orderCustomerReference?: string | null
  },
): InvoiceDocContext {
  const invoice: ShpInvoice = {
    id: note.id,
    orderId: note.orderId,
    orderNumber: note.orderNumber,
    invoiceNumber: note.invoiceNumber,
    status: 'ISSUED',
    issuedAt: note.issuedAt,
    taxPointDate: note.taxPointDate,
    dueDate: null,
    currency: note.currency,
    currencySymbol: note.currencySymbol,
    taxMode: note.taxMode,
    subtotal: note.subtotal,
    // A credit note credits money that has already had any discount taken off
    // it, so there is nothing left to show a discount row for.
    discountAmount: '0.00',
    shippingAmount: note.shippingAmount,
    taxAmount: note.taxAmount,
    total: note.total,
    seller: note.seller,
    customer: note.customer,
    lines: note.lines,
    taxBreakdown: note.taxBreakdown,
    wording: note.wording,
    issuedBy: note.issuedBy,
    issueTrigger: null,
    createdByUserId: note.createdByUserId,
    sinkResults: note.sinkResults,
    voidedAt: null,
    voidReason: null,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }
  return {
    invoice: withOrderCustomerReference(invoice, opts?.orderCustomerReference),
    print: opts?.print ?? false,
    // Nothing on a credit note is owed, so nothing on one is unpaid. Blocks that
    // hide themselves once the money is in - the bank details in particular -
    // have no business on a document that gives money back.
    paid: true,
    credit: { creditNoteNumber: note.creditNoteNumber, reason: note.reason },
  }
}
