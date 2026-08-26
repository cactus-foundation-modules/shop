import { prisma } from '@/lib/db/prisma'
import { getShopConfigCached, type ShpConfig } from '@/modules/shop/lib/config'
import { getOrderByNumber, getOrderItems } from '@/modules/shop/lib/db/orders'
import { buildCustomer, buildSeller, addDays, dateInZone } from '@/modules/shop/lib/invoices'
import { buildInvoiceMoney } from '@/modules/shop/lib/invoice-tax'
import { manualPaymentInstructions } from '@/modules/shop/lib/payment-instructions'
import { getPaymentProvider } from '@/modules/shop/lib/payments/registry'
import type { InvoiceDocContext } from '@/modules/shop/lib/invoice-doc-context'
import type { ShpInvoice, ShpInvoiceWording, ShpOrder, ShpOrderItem } from '@/modules/shop/lib/types'

// The proforma invoice: the document a shop hands over when the goods are
// ordered and nobody has been paid yet.
//
// It exists because of one very ordinary sequence. A business orders on bank
// transfer, their accounts department asks for "an invoice" before they will
// release the payment, the shop cannot issue a VAT invoice for money it has not
// received, and the order sits there. A proforma is the document that unblocks
// that: it says what is owed, to whom, and how to pay it, and it says on its
// face that it is not a VAT invoice.
//
// THREE THINGS IT DELIBERATELY IS NOT
//
//  1. Not a table. An invoice is frozen in shp_invoices because it is a
//     statutory record of what was charged on a given day, and re-deriving it
//     later would quietly rewrite history. A proforma is the opposite animal: a
//     live request for payment against an order that can still change. So it is
//     rendered from the order every time it is opened, and always shows what is
//     actually owed today. No table, no snapshot, no migration.
//
//  2. Not numbered from the invoice sequence. It carries the ORDER's number,
//     which is what the customer quotes with their payment anyway. Burning an
//     invoice number on a document that is not an invoice would leave a gap in a
//     sequence HMRC expects to be able to read straight through.
//
//  3. Not a sale. Nothing here reaches the bookkeeping sinks and nothing claims
//     a tax point. The VAT invoice is still raised when the shop's invoicing
//     settings say so, with its own number and its own date.

/** Which orders a proforma is offered for: any method with no automated
 *  confirmation - bank transfer, cash, and any method a module contributes with
 *  confirmMode 'manual'. Taken from the provider's own declaration rather than a
 *  list of method codes, so shop never has to name anybody else's module.
 *
 *  Not gated on whether the money has arrived. A buyer who paid by transfer last
 *  week still has a proforma in their filing, and losing the link the moment the
 *  payment cleared would take their own paperwork off them - the document simply
 *  restates itself as paid. */
export function proformaApplies(order: Pick<ShpOrder, 'status' | 'paymentMethod'>): boolean {
  if (order.status === 'CANCELLED') return false
  return getPaymentProvider(order.paymentMethod)?.confirmMode === 'manual'
}

/** Whether this order should be offered one at all, settings included. */
export function proformaAvailable(
  config: Pick<ShpConfig, 'proformaEnabled'>,
  order: Pick<ShpOrder, 'status' | 'paymentMethod'>,
): boolean {
  return config.proformaEnabled && proformaApplies(order)
}

/** The wording as settings read today - not snapshotted, because there is
 *  nothing here to protect from a later edit. A proforma is a request, and a
 *  request restated in this month's words is still the same request. */
function buildWording(config: ShpConfig, order: ShpOrder, paid: boolean): ShpInvoiceWording {
  // Where to send the money: the same words the thank-you page and the "how to
  // pay" email print, so a customer holding all three is not reading three
  // different sets of bank details. Falls back to the invoice's own payment
  // wording for a method shop holds no instructions for.
  const instructions = manualPaymentInstructions(order.paymentMethod, config)
  return {
    heading: config.proformaHeading.trim() || 'Proforma invoice',
    intro: '',
    taxLabel: config.invoiceTaxLabel.trim() || 'VAT',
    paymentDetails: paid ? '' : (instructions || config.invoicePaymentDetails.trim()),
    // The proforma's own terms while it is a request for money; the invoice's
    // ordinary ones once it is a record of one that was met.
    terms: paid ? config.invoiceTerms.trim() : config.proformaTerms.trim(),
    footer: config.invoiceFooter.trim(),
    proformaWording: paid
      ? config.proformaPaidWording.trim()
      : config.proformaUnpaidWording.trim(),
    proformaNotice: config.proformaNotice.trim(),
  }
}

/**
 * One order as the document blocks want it.
 *
 * Presented as an invoice for the same reason a credit note is: the blocks were
 * written for that shape, they already carry every field this needs, and a
 * second type would mean six blocks each learning about a third document.
 *
 * Two fields are worth pointing at:
 *
 *  - `invoiceNumber` is the ORDER's number. That is the proforma's own number,
 *    it is what the customer quotes with their payment, and it means the header
 *    prints correctly with no branch in it.
 *
 *  - `taxPointDate` is the day the document is drawn, not a tax point. Nothing
 *    on a proforma has a tax point - that is rather the definition of one - but
 *    the field is what {{INVOICE_DATE}} reads, and a document with no date on it
 *    is no use to the person filing it.
 */
export async function proformaDocContext(
  order: ShpOrder,
  items: ShpOrderItem[],
  opts?: { print?: boolean },
): Promise<InvoiceDocContext> {
  const config = await getShopConfigCached()
  const site = await prisma.siteConfig
    .findUnique({ where: { id: 'singleton' }, select: { timezone: true } })
    .catch(() => null)
  const timezone = site?.timezone || 'UTC'
  const paid = order.paymentStatus === 'PAID'

  const issuedOn = dateInZone(order.paidAt ?? new Date(), timezone)
  const dueDate = !paid && config.invoicePaymentTermsDays > 0
    ? addDays(dateInZone(new Date(), timezone), config.invoicePaymentTermsDays)
    : null

  // Lead times kept, which is the one arithmetic difference from an invoice.
  // See lineDetail in lib/invoice-tax.ts for why they belong here and nowhere
  // else: this document is read by somebody deciding whether to send the money,
  // and how long each line takes is what they are weighing up.
  const { lines, taxBreakdown } = buildInvoiceMoney(order, items, { keepDeliveryDetail: true })
  const seller = await buildSeller(config)

  const invoice: ShpInvoice = {
    id: order.id,
    orderId: order.id,
    orderNumber: order.orderNumber,
    invoiceNumber: order.orderNumber,
    status: 'ISSUED',
    issuedAt: order.createdAt,
    taxPointDate: issuedOn,
    dueDate,
    currency: order.currency,
    currencySymbol: config.currencySymbol,
    taxMode: order.taxMode,
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    shippingAmount: order.shippingAmount,
    taxAmount: order.taxAmount,
    total: order.total,
    seller,
    customer: buildCustomer(order),
    lines,
    taxBreakdown,
    wording: buildWording(config, order, paid),
    issuedBy: 'AUTO',
    issueTrigger: null,
    createdByUserId: null,
    sinkResults: [],
    voidedAt: null,
    voidReason: null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  }

  return { invoice, print: opts?.print ?? false, proforma: { paid } }
}

/** The order behind a proforma link, or null where there is no proforma to draw
 *  - the order is gone, the shop has them switched off, or it was never a
 *  pay-later order in the first place. */
export async function loadProforma(orderNumber: string): Promise<{ order: ShpOrder; items: ShpOrderItem[] } | null> {
  const config = await getShopConfigCached()
  if (!config.proformaEnabled) return null
  const order = await getOrderByNumber(orderNumber)
  if (!order || !proformaApplies(order)) return null
  const items = await getOrderItems(order.id)
  return { order, items }
}
