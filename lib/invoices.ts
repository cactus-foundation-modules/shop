import { prisma } from '@/lib/db/prisma'
import { getSiteUrl } from '@/lib/config/env'
import { getShopConfigCached, type ShpConfig } from '@/modules/shop/lib/config'
import { getOrderById, getOrderItems } from '@/modules/shop/lib/db/orders'
import {
  getInvoiceForOrder,
  getInvoiceById,
  insertInvoice,
  InvoiceAlreadyIssuedError,
  saveSinkResults,
  voidInvoice,
  type InsertInvoiceInput,
} from '@/modules/shop/lib/db/invoices'
import { generateInvoiceNumber } from '@/modules/shop/lib/invoice-number'
import { buildInvoiceMoney, ledgerItems } from '@/modules/shop/lib/invoice-tax'
import { invoicePdfFilename, printPath } from '@/modules/shop/lib/invoice-pdf'
import {
  dispatchInvoiceIssued,
  dispatchInvoiceVoided,
  type ShopInvoiceSinkPayload,
  type ShopInvoiceVoidedPayload,
} from '@/modules/shop/lib/invoice-sinks'
import { invoicePath, signInvoiceToken } from '@/modules/shop/lib/invoice-token'
import { addressLines, orderCompanyName } from '@/modules/shop/lib/order-display'
import type { ShpInvoice, ShpInvoiceSeller, ShpInvoiceCustomer, ShpInvoiceWording, ShpOrder } from '@/modules/shop/lib/types'

// Issuing an invoice: the one place it happens, for the same reason
// lib/order-status.ts exists. Three callers reach it - the status change, the
// payment fulfilment and the button on the order screen - and "what raising an
// invoice actually means" must not have three versions.
//
// Everything about it is once-only. The partial unique index on shp_invoices is
// what enforces that rather than a read here, because two of those three
// callers can genuinely fire at the same moment.

/** What caused an invoice to be raised. Recorded on the row, and matched
 *  against the shop's `invoiceIssueOn` setting by the callers. */
export type InvoiceTrigger = 'PAID' | 'DISPATCHED' | 'COMPLETED' | 'MANUAL' | 'REISSUE'

export type IssueInvoiceResult =
  | { ok: true; invoice: ShpInvoice; created: boolean }
  | { ok: false; status: number; error: string }

/** The tax point as a plain yyyy-mm-dd, worked out in the site's own timezone.
 *  A payment taken at half past midnight in London is that day's sale, and a
 *  UTC slice of the timestamp would file it in the previous quarter on the
 *  first of April. */
export function dateInZone(date: Date, timezone: string): string {
  try {
    // en-CA formats as yyyy-mm-dd, which is what a DATE column wants.
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function splitLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

/** Who is issuing it, as the settings read today. Blank business details fall
 *  back to the shop's own, so an owner who has switched invoicing on without
 *  filling the form still gets a document with a name on it - the settings
 *  screen is where the missing VAT number is complained about, not here. */
export async function buildSeller(config: ShpConfig): Promise<ShpInvoiceSeller> {
  const site = await prisma.siteConfig
    .findUnique({ where: { id: 'singleton' }, select: { siteName: true, logoMediaId: true } })
    .catch(() => null)
  const logo = site?.logoMediaId
    ? await prisma.media.findUnique({ where: { id: site.logoMediaId }, select: { url: true } }).catch(() => null)
    : null

  return {
    name: config.invoiceBusinessName.trim() || config.shopTitle.trim() || site?.siteName || '',
    addressLines: splitLines(config.invoiceAddress),
    vatNumber: config.invoiceVatNumber.trim(),
    companyNumber: config.invoiceCompanyNumber.trim(),
    email: config.invoiceContactEmail.trim() || config.storeEmail.trim(),
    phone: config.invoiceContactPhone.trim(),
    siteName: site?.siteName ?? '',
    siteUrl: getSiteUrl(),
    logoUrl: logo?.url ?? null,
  }
}

/** Who it is for. The billing address is the invoice address where one was
 *  given; a shop that never asks for one bills to the delivery address, which
 *  is what the order screen already shows. */
export function buildCustomer(order: ShpOrder): ShpInvoiceCustomer {
  const billing = order.billingAddress ?? order.shippingAddress
  return {
    name: order.customerName,
    // One answer, shared with the orders list and the search - see
    // orderCompanyName for why the order's own field comes before the two
    // address fallbacks.
    company: orderCompanyName(order) ?? '',
    // Their reference, not ours. Frozen here with everything else on the
    // document: the number the customer's finance team matches this invoice
    // against has to still read the way it read when the invoice was sent.
    reference: order.customerReference?.trim() ?? '',
    email: order.customerEmail,
    phone: order.customerPhone ?? '',
    billingAddress: billing ? addressLines(billing) : [],
    shippingAddress: order.shippingAddress ? addressLines(order.shippingAddress) : [],
  }
}

/** The headings and small print as settings read today. Exported because the
 *  reissue path (lib/invoice-reissue.ts) raises an invoice of its own and must
 *  word it exactly as this one does. */
export function buildWording(config: ShpConfig): ShpInvoiceWording {
  return {
    heading: config.invoiceHeading.trim() || 'Invoice',
    intro: config.invoiceIntro.trim(),
    taxLabel: config.invoiceTaxLabel.trim() || 'VAT',
    paymentDetails: config.invoicePaymentDetails.trim(),
    terms: config.invoiceTerms.trim(),
    footer: config.invoiceFooter.trim(),
    customerReferenceLabel: config.customerReferenceLabel.trim(),
  }
}

/** The invoice printed to PDF bytes, for a sink that files evidence.
 *
 *  Never throws: a set of books that cannot get hold of the document should
 *  record the sale anyway and say the evidence is missing, not lose the sale. A
 *  shop with PDFs switched off simply has no document to hand over. */
async function invoicePdfBytes(invoiceNumber: string): Promise<Buffer | null> {
  try {
    const config = await getShopConfigCached()
    if (!config.invoicePdfEnabled) return null
    const { renderInvoicePdf } = await import('@/modules/shop/lib/invoice-pdf')
    const path = printPath(`/shop/invoice/${encodeURIComponent(invoiceNumber)}`, signInvoiceToken(invoiceNumber))
    return Buffer.from(await renderInvoicePdf(path))
  } catch (error) {
    console.error('[shop] could not print invoice', invoiceNumber, 'for a bookkeeping sink:', error)
    return null
  }
}

/** The statement of fact handed to any bookkeeping module listening at
 *  `shop.invoice-issued`. Built here so the manual re-send and the automatic
 *  one send exactly the same thing. */
export function invoiceSinkPayload(invoice: ShpInvoice, orderNumber: string, settledDate: string | null): ShopInvoiceSinkPayload {
  const net = invoice.taxBreakdown.reduce((sum, row) => sum + Number(row.net), 0)
  const siteUrl = invoice.seller.siteUrl || getSiteUrl()
  return {
    source: 'shop',
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    orderId: invoice.orderId,
    orderNumber,
    issuedAt: invoice.issuedAt.toISOString(),
    taxPointDate: invoice.taxPointDate,
    settledDate,
    currency: invoice.currency,
    taxMode: invoice.taxMode,
    customer: { name: invoice.customer.name ?? '', company: invoice.customer.company ?? '', email: invoice.customer.email ?? '' },
    totals: { net: net.toFixed(2), tax: invoice.taxAmount, gross: invoice.total },
    taxBreakdown: invoice.taxBreakdown,
    // What was actually sold, so the books read as a list of goods rather than
    // one lump per VAT rate. Empty when the rows could not be made to tie to the
    // rate summary exactly, which the recorder takes as "file it per rate".
    // The delivery label only where there was delivery charged to explain the
    // leftover. On an invoice with none, whatever is left over is the rounding
    // penny the rate summary was nudged by, and calling that "Delivery" would be
    // a small lie in somebody's books.
    items: ledgerItems(invoice.lines, invoice.taxBreakdown, {
      carriageLabel: Number(invoice.shippingAmount) > 0 ? 'Delivery' : undefined,
    }),
    description: `Shop order ${orderNumber}, invoice ${invoice.invoiceNumber}`,
    documentUrl: siteUrl ? `${siteUrl}${invoicePath(invoice.invoiceNumber)}` : null,
    document: {
      filename: invoicePdfFilename(invoice.seller?.name || 'invoice', invoice.invoiceNumber),
      mimeType: 'application/pdf',
      bytes: () => invoicePdfBytes(invoice.invoiceNumber),
    },
  }
}

/** The matching statement when one is withdrawn. Built from the invoice itself
 *  rather than from the order, for the same reason the invoice is a snapshot: a
 *  sale is undone by exactly what was recorded, not by what the order says
 *  today. */
export function invoiceVoidSinkPayload(invoice: ShpInvoice, orderNumber: string): ShopInvoiceVoidedPayload {
  const net = invoice.taxBreakdown.reduce((sum, row) => sum + Number(row.net), 0)
  return {
    source: 'shop',
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    orderId: invoice.orderId,
    orderNumber,
    issuedAt: invoice.issuedAt.toISOString(),
    voidedAt: (invoice.voidedAt ?? new Date()).toISOString(),
    reason: invoice.voidReason ?? '',
    taxPointDate: invoice.taxPointDate,
    currency: invoice.currency,
    totals: { net: net.toFixed(2), tax: invoice.taxAmount, gross: invoice.total },
    taxBreakdown: invoice.taxBreakdown,
    description: `Shop order ${orderNumber}, invoice ${invoice.invoiceNumber} voided`,
  }
}

/** The site's own timezone, or UTC where it has not said. Its own function
 *  because a tax point worked out in the wrong zone files a sale in the wrong
 *  quarter, and three callers now need the same answer. */
export async function siteTimezone(): Promise<string> {
  const site = await prisma.siteConfig
    .findUnique({ where: { id: 'singleton' }, select: { timezone: true } })
    .catch(() => null)
  return site?.timezone || 'UTC'
}

/**
 * Everything a row in shp_invoices is made of, for an order.
 *
 * Extracted so the reissue path raises its replacement through exactly this
 * code rather than through a second copy of it: the two documents differ in
 * their number and in who they are made out to, and in nothing else. A
 * replacement whose totals or tax point drifted from the original's would be a
 * quiet correction to a sale nobody asked to correct.
 *
 * The tax point is the ORDER's - when it was paid for where that is known, and
 * today otherwise - so a replacement raised weeks later still belongs to the
 * quarter the sale happened in. An unpaid order invoiced on despatch is dated
 * the despatch, which is the ordinary rule for goods sent before payment.
 */
export async function buildInvoiceInsertInput(
  order: ShpOrder,
  config: ShpConfig,
  opts: { trigger: InvoiceTrigger; issuedBy: 'AUTO' | 'MANUAL'; userId: string | null; timezone?: string },
): Promise<InsertInvoiceInput> {
  const [items, timezone] = await Promise.all([
    getOrderItems(order.id),
    opts.timezone ? Promise.resolve(opts.timezone) : siteTimezone(),
  ])
  const taxPointDate = dateInZone(order.paidAt ?? new Date(), timezone)
  const dueDate = config.invoicePaymentTermsDays > 0 ? addDays(taxPointDate, config.invoicePaymentTermsDays) : null

  const { lines, taxBreakdown } = buildInvoiceMoney(order, items)
  const [seller, invoiceNumber] = await Promise.all([buildSeller(config), generateInvoiceNumber()])

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    invoiceNumber,
    taxPointDate,
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
    wording: buildWording(config),
    issuedBy: opts.issuedBy,
    issueTrigger: opts.trigger,
    createdByUserId: opts.userId,
  }
}

/**
 * Raises the invoice for an order, or hands back the one it already has.
 *
 * Never throws at its callers: it sits inside a status change and a payment
 * webhook, and neither may fail because the paperwork did. Refusals come back
 * as `{ ok: false }` with a sentence the admin screen can print.
 */
export async function issueInvoiceForOrder(
  orderId: string,
  opts: { trigger: InvoiceTrigger; issuedBy: 'AUTO' | 'MANUAL'; userId?: string | null },
): Promise<IssueInvoiceResult> {
  const config = await getShopConfigCached()
  if (!config.invoicesEnabled) {
    return { ok: false, status: 409, error: 'Invoicing is switched off in Shop settings.' }
  }

  const existing = await getInvoiceForOrder(orderId)
  if (existing) return { ok: true, invoice: existing, created: false }

  const order = await getOrderById(orderId)
  if (!order) return { ok: false, status: 404, error: 'Order not found.' }
  // A cancelled order was never sold. Invoicing one would put a sale in the
  // books that has to be credited straight back out again.
  if (order.status === 'CANCELLED') {
    return { ok: false, status: 409, error: 'A cancelled order cannot be invoiced.' }
  }

  const timezone = await siteTimezone()
  const input = await buildInvoiceInsertInput(order, config, {
    trigger: opts.trigger,
    issuedBy: opts.issuedBy,
    userId: opts.userId ?? null,
    timezone,
  })

  let invoice: ShpInvoice
  try {
    invoice = await insertInvoice(input)
  } catch (error) {
    if (error instanceof InvoiceAlreadyIssuedError) {
      // Somebody beat us to it between the read above and the insert. Their
      // invoice is as good as ours would have been. The number this attempt
      // burned is simply spent - sequences do not go backwards, and a gap in
      // the numbering is a great deal better than two invoices for one order.
      const raced = await getInvoiceForOrder(orderId)
      if (raced) return { ok: true, invoice: raced, created: false }
    }
    console.error('[shop] could not issue an invoice for order', orderId, error)
    return { ok: false, status: 500, error: 'The invoice could not be raised. Please try again.' }
  }

  const settledDate = order.paidAt ? dateInZone(order.paidAt, timezone) : null
  const results = await dispatchInvoiceIssued(invoiceSinkPayload(invoice, order.orderNumber, settledDate))
  if (results.length > 0) {
    await saveSinkResults(invoice.id, results).catch((error) => {
      console.error('[shop] could not record invoice sink results for', invoice.invoiceNumber, error)
    })
    invoice = { ...invoice, sinkResults: results }
  }

  return { ok: true, invoice, created: true }
}

/**
 * Hands an already-issued invoice to the bookkeeping sinks again.
 *
 * For the case the sink results record: a bookkeeping module that was mid-return,
 * misconfigured or simply down when the sale happened. Recorders are expected to
 * be idempotent on the invoice number, so pressing this twice does not book the
 * sale twice.
 */
export async function resendInvoiceToSinks(invoiceId: string): Promise<IssueInvoiceResult> {
  const invoice = await getInvoiceById(invoiceId)
  if (!invoice) return { ok: false, status: 404, error: 'Invoice not found.' }

  const order = await getOrderById(invoice.orderId)

  // A voided invoice has something to say to the books as well, and it is the
  // more urgent of the two: an entry left standing for a sale that was withdrawn
  // is VAT the shop pays over and never took. So the button says the same thing
  // again, whichever state the invoice is in.
  if (invoice.status === 'VOID') {
    const results = await dispatchInvoiceVoided(invoiceVoidSinkPayload(invoice, order?.orderNumber ?? ''))
    await saveSinkResults(invoice.id, results)
    return { ok: true, invoice: { ...invoice, sinkResults: results }, created: false }
  }

  const settledDate = order?.paidAt ? dateInZone(order.paidAt, await siteTimezone()) : null

  const results = await dispatchInvoiceIssued(invoiceSinkPayload(invoice, order?.orderNumber ?? '', settledDate))
  await saveSinkResults(invoice.id, results)
  return { ok: true, invoice: { ...invoice, sinkResults: results }, created: false }
}

/**
 * Withdraws an invoice and tells the books.
 *
 * The two halves are one action on purpose. Voiding the row and leaving whatever
 * recorded the sale to find out on its own is how a shop ends up paying VAT on a
 * sale it withdrew - which is precisely what happened before this existed.
 *
 * The sinks run after the row is voided, never before: the void is the thing
 * that must not fail. What each said is recorded on the invoice and printed on
 * the order screen, and the button there says it again if one was down.
 */
export async function voidInvoiceAndTellSinks(invoiceId: string, reason: string): Promise<IssueInvoiceResult> {
  const done = await voidInvoice(invoiceId, reason)
  if (!done) return { ok: false, status: 409, error: 'That invoice was not there to void.' }

  const invoice = await getInvoiceById(invoiceId)
  if (!invoice) return { ok: false, status: 404, error: 'Invoice not found.' }

  const order = await getOrderById(invoice.orderId)
  const results = await dispatchInvoiceVoided(invoiceVoidSinkPayload(invoice, order?.orderNumber ?? ''))
  if (results.length > 0) {
    await saveSinkResults(invoice.id, results).catch((error) => {
      console.error('[shop] could not record void sink results for', invoice.invoiceNumber, error)
    })
    return { ok: true, invoice: { ...invoice, sinkResults: results }, created: false }
  }
  return { ok: true, invoice, created: false }
}

/** Whether a status change should raise an invoice, given the shop's setting.
 *  Pure, so the two callers agree by construction rather than by both being
 *  right. */
export function shouldIssueOn(config: Pick<ShpConfig, 'invoicesEnabled' | 'invoiceIssueOn'>, trigger: InvoiceTrigger): boolean {
  if (!config.invoicesEnabled) return false
  if (trigger === 'MANUAL') return true
  return config.invoiceIssueOn === trigger
}
