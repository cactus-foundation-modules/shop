import { prisma } from '@/lib/db/prisma'
import { getSiteUrl } from '@/lib/config/env'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getOrderById, getOrderItems } from '@/modules/shop/lib/db/orders'
import { getInvoiceForOrder } from '@/modules/shop/lib/db/invoices'
import { getRefundById, getRefundItems } from '@/modules/shop/lib/db/refunds'
import {
  CreditNoteAlreadyIssuedError,
  getCreditNoteById,
  getCreditNoteForRefund,
  insertCreditNote,
  saveCreditNoteSinkResults,
} from '@/modules/shop/lib/db/credit-notes'
import { generateCreditNoteNumber } from '@/modules/shop/lib/credit-note-number'
import { CreditNoteMoneyError, buildCreditNoteMoney } from '@/modules/shop/lib/credit-note-tax'
import { ledgerItems } from '@/modules/shop/lib/invoice-tax'
import { invoicePdfFilename } from '@/modules/shop/lib/invoice-pdf'
import { dispatchInvoiceCredited, type ShopInvoiceCreditedPayload } from '@/modules/shop/lib/invoice-sinks'
import { creditNotePath, signCreditNoteToken } from '@/modules/shop/lib/invoice-token'
import { sendShopEmail } from '@/modules/shop/lib/email'
import { formatMoney } from '@/modules/shop/lib/money'
import type { ShpCreditNote, ShpInvoiceWording } from '@/modules/shop/lib/types'

// Raising a credit note: the one place it happens.
//
// A refund used to be a purely internal event - money went back, a row was
// written, and nothing else in the world was told. That left two holes at once.
// The customer got no paperwork for money leaving their account, and any set of
// books listening at `shop.invoice-issued` went on carrying the whole sale,
// VAT and all, on turnover a fifth of which had been handed back. The shop then
// pays HMRC tax it never kept, quarter after quarter, and nothing on any screen
// says so.
//
// So: a settled refund raises a credit note, the credit note is a real document
// with its own number, and the books are told. Everything here is once-only per
// refund, enforced by the partial unique index rather than by a read - the
// refund route and the retry button on the order screen can both be in flight.
//
// Nothing in this file may throw at its caller. It runs immediately after money
// has moved at a payment provider, and there is no version of "the paperwork
// failed" that justifies unwinding a refund the customer has already been sent.
// Refusals come back as `{ ok: false }` with a sentence the order screen prints.

export type IssueCreditNoteResult =
  | { ok: true; creditNote: ShpCreditNote; created: boolean }
  | { ok: false; status: number; error: string }

/** The tax point as a plain yyyy-mm-dd in the site's own timezone. A refund
 *  processed at half past midnight in London is that day's credit, and a UTC
 *  slice would file it in the previous quarter on the first of April. */
function dateInZone(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

/** The credit note printed to PDF bytes, for a sink that files evidence.
 *
 *  Never throws, exactly as the invoice's does not: a set of books that cannot
 *  get hold of the document should record the credit anyway and say the evidence
 *  is missing, not lose the credit. */
async function creditNotePdfBytes(creditNoteNumber: string): Promise<Buffer | null> {
  try {
    const config = await getShopConfigCached()
    if (!config.invoicePdfEnabled) return null
    const { renderInvoicePdf } = await import('@/modules/shop/lib/invoice-pdf')
    const path = `/shop/credit-note/${encodeURIComponent(creditNoteNumber)}?t=${signCreditNoteToken(creditNoteNumber)}&print=1`
    return Buffer.from(await renderInvoicePdf(path))
  } catch (error) {
    console.error('[shop] could not print credit note', creditNoteNumber, 'for a bookkeeping sink:', error)
    return null
  }
}

/** The statement of fact handed to any bookkeeping module listening at
 *  `shop.invoice-credited`. Built here so the automatic raise and the manual
 *  re-send hand over exactly the same thing. */
export function creditNoteSinkPayload(note: ShpCreditNote, full: boolean): ShopInvoiceCreditedPayload {
  const net = note.taxBreakdown.reduce((sum, row) => sum + Number(row.net), 0)
  const siteUrl = note.seller?.siteUrl || getSiteUrl()
  return {
    source: 'shop',
    creditNoteId: note.id,
    creditNoteNumber: note.creditNoteNumber,
    invoiceId: note.invoiceId,
    invoiceNumber: note.invoiceNumber,
    orderId: note.orderId,
    orderNumber: note.orderNumber,
    issuedAt: note.issuedAt.toISOString(),
    taxPointDate: note.taxPointDate,
    currency: note.currency,
    taxMode: note.taxMode,
    customer: {
      name: note.customer?.name ?? '',
      company: note.customer?.company ?? '',
      email: note.customer?.email ?? '',
    },
    totals: { net: net.toFixed(2), tax: note.taxAmount, gross: note.total },
    taxBreakdown: note.taxBreakdown,
    // What was actually handed back, line by line. No carriage label: a refund
    // is against order lines and delivery never rides along on one, so anything
    // left over here is the rounding penny and nothing else.
    items: ledgerItems(note.lines, note.taxBreakdown),
    full,
    reason: note.reason ?? '',
    description: `Shop order ${note.orderNumber}, credit note ${note.creditNoteNumber} against invoice ${note.invoiceNumber}`,
    documentUrl: siteUrl ? `${siteUrl}${creditNotePath(note.creditNoteNumber)}` : null,
    document: {
      filename: invoicePdfFilename(note.seller?.name || 'credit-note', note.creditNoteNumber),
      mimeType: 'application/pdf',
      bytes: () => creditNotePdfBytes(note.creditNoteNumber),
    },
  }
}

/** Whether this credit takes the invoice all the way back to nothing. Compared
 *  in pennies rather than on floats: 0.1 + 0.2 is not 0.3, and "is this the
 *  whole invoice" is not a question to answer with a rounding error. */
function creditsWholeInvoice(creditedSoFar: number, invoiceTotal: number): boolean {
  return Math.round(creditedSoFar * 100) >= Math.round(invoiceTotal * 100)
}

/**
 * Raises the credit note for a settled refund, or hands back the one it already
 * has.
 *
 * Never throws at its callers. Every refusal is a sentence.
 */
export async function issueCreditNoteForRefund(
  refundId: string,
  opts: { issuedBy: 'AUTO' | 'MANUAL'; userId?: string | null },
): Promise<IssueCreditNoteResult> {
  try {
    const config = await getShopConfigCached()
    // Credit notes hang off invoicing. A shop that does not invoice has nothing
    // to credit, and issuing a credit note against no invoice would be a
    // document referring to one that was never sent.
    if (!config.invoicesEnabled) return { ok: false, status: 400, error: 'This shop does not raise invoices, so there is nothing to credit.' }
    if (!config.creditNotesEnabled) return { ok: false, status: 400, error: 'Credit notes are switched off in Shop settings.' }

    const existing = await getCreditNoteForRefund(refundId)
    if (existing) return { ok: true, creditNote: existing, created: false }

    const refund = await getRefundById(refundId)
    if (!refund) return { ok: false, status: 404, error: 'That refund could not be found.' }
    // Only money that actually moved gets a document. A PENDING row is a
    // reservation and a FAILED one is a refund that never happened; raising
    // paperwork for either would credit VAT the shop still owes.
    if (refund.status !== 'COMPLETED') {
      return { ok: false, status: 409, error: 'That refund has not gone through, so there is nothing to credit yet.' }
    }

    const order = await getOrderById(refund.orderId)
    if (!order) return { ok: false, status: 404, error: 'That order could not be found.' }

    const invoice = await getInvoiceForOrder(refund.orderId)
    if (!invoice) {
      return { ok: false, status: 409, error: 'This order has no live invoice, so there is nothing to raise a credit note against.' }
    }

    const refundItems = await getRefundItems(refundId)
    if (refundItems.length === 0) {
      return { ok: false, status: 409, error: 'That refund has no lines recorded against it, so its tax cannot be worked out.' }
    }

    // The ids in the order the invoice's lines were built in, which is what lets
    // a credit note against an older invoice fall back to position.
    const orderItems = await getOrderItems(refund.orderId)
    const orderItemIds = orderItems.map((item) => item.id)

    let money
    try {
      money = buildCreditNoteMoney(
        invoice.lines,
        orderItemIds,
        refundItems.map((item) => ({ orderItemId: item.orderItemId, quantity: item.quantity, amount: Number(item.amount) })),
        order.taxMode,
      )
    } catch (error) {
      // Never guessed around. A credit note carrying an invented VAT rate looks
      // like paperwork and files a wrong return, which is worse than no credit
      // note at all - the owner can see this sentence and sort it by hand.
      if (error instanceof CreditNoteMoneyError) return { ok: false, status: 422, error: error.message }
      throw error
    }

    const site = await prisma.siteConfig
      .findUnique({ where: { id: 'singleton' }, select: { timezone: true } })
      .catch(() => null)
    const taxPointDate = dateInZone(refund.createdAt ?? new Date(), site?.timezone || 'UTC')

    // The invoice's own seller, customer and small print, not today's settings.
    // The two documents are read side by side and must agree about who they are
    // between; an owner who has changed their trading address since should not
    // find the credit note disagreeing with the invoice it credits.
    const wording: ShpInvoiceWording = {
      ...invoice.wording,
      heading: config.creditNoteHeading.trim() || 'Credit note',
      intro: '',
      // Nothing is due and nothing is to be paid, so the payment block bows out
      // of its own accord (it renders nothing when all three are empty). The
      // footer stays: it is usually the company registration line, which belongs
      // on both documents.
      paymentDetails: '',
      terms: '',
      creditWording: config.creditNoteWording.trim(),
    }

    const creditNoteNumber = await generateCreditNoteNumber()
    let note: ShpCreditNote
    try {
      note = await insertCreditNote({
        orderId: order.id,
        orderNumber: order.orderNumber,
        creditNoteNumber,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        refundId,
        taxPointDate,
        currency: invoice.currency,
        currencySymbol: invoice.currencySymbol,
        taxMode: order.taxMode,
        subtotal: money.subtotal,
        // A refund is against order lines; delivery is not one, so it never
        // rides along. If a shop ever refunds delivery it will arrive as a line
        // like any other.
        shippingAmount: '0.00',
        taxAmount: money.taxAmount,
        total: money.total,
        seller: invoice.seller,
        customer: invoice.customer,
        lines: money.lines,
        taxBreakdown: money.taxBreakdown,
        wording,
        reason: refund.reason,
        issuedBy: opts.issuedBy,
        createdByUserId: opts.userId ?? null,
      })
    } catch (error) {
      if (error instanceof CreditNoteAlreadyIssuedError) {
        // Somebody beat us to it between the check above and the insert. Their
        // credit note is as good as ours would have been; the number this
        // attempt burned is simply spent, and a gap in the numbering is a great
        // deal better than two credit notes for one refund.
        const raced = await getCreditNoteForRefund(refundId)
        if (raced) return { ok: true, creditNote: raced, created: false }
      }
      console.error('[shop] could not raise a credit note for refund', refundId, error)
      return { ok: false, status: 500, error: 'The credit note could not be raised. Please try again.' }
    }

    const withResults = await tellTheBooks(note, invoice.total)
    await emailCustomer(withResults, config.creditNoteEmailCustomer)
    return { ok: true, creditNote: withResults, created: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[shop] could not raise a credit note for refund', refundId, message)
    return { ok: false, status: 500, error: 'The credit note could not be raised. Please try again.' }
  }
}

/** Hands a credit note to every registered bookkeeping sink and records what
 *  each said. Split out because the retry button needs exactly this and nothing
 *  else. Failures never propagate: the money has gone back either way. */
async function tellTheBooks(note: ShpCreditNote, invoiceTotal: string): Promise<ShpCreditNote> {
  const creditedRows = await prisma.$queryRaw<{ sum: string }[]>`
    SELECT COALESCE(SUM("total"), 0)::text AS sum FROM "shp_credit_notes"
    WHERE "invoice_id" = ${note.invoiceId}
  `
  const full = creditsWholeInvoice(Number(creditedRows[0]?.sum ?? 0), Number(invoiceTotal))

  const results = await dispatchInvoiceCredited(creditNoteSinkPayload(note, full))
  if (results.length === 0) return note
  await saveCreditNoteSinkResults(note.id, results).catch((error) => {
    console.error('[shop] could not record credit note sink results for', note.creditNoteNumber, error)
  })
  return { ...note, sinkResults: results }
}

/** Sends the customer their copy. Never fails the credit note: the document is
 *  raised and readable either way, and a bounced email is not a reason to lose
 *  the paperwork. */
async function emailCustomer(note: ShpCreditNote, wanted: boolean): Promise<void> {
  if (!wanted) return
  const to = note.customer?.email?.trim()
  if (!to) return
  try {
    const siteUrl = note.seller?.siteUrl || getSiteUrl()
    await sendShopEmail(
      'CREDIT_NOTE_ISSUED',
      to,
      {
        customerName: note.customer?.name ?? '',
        orderNumber: note.orderNumber,
        creditNoteNumber: note.creditNoteNumber,
        invoiceNumber: note.invoiceNumber,
        creditNoteUrl: siteUrl ? `${siteUrl}${creditNotePath(note.creditNoteNumber)}` : '',
        creditAmount: formatMoney(note.total, note.currencySymbol || '£'),
        creditReason: note.reason ?? '',
      },
      { orderId: note.orderId },
    )
  } catch (error) {
    console.error('[shop] could not email credit note', note.creditNoteNumber, error)
  }
}

/**
 * Hands an already-raised credit note to the bookkeeping sinks again.
 *
 * For the case the sink results record: a bookkeeping module that was mid-return,
 * misconfigured or simply down when the refund happened. Recorders are expected
 * to be idempotent on the credit note number, so pressing this twice does not
 * credit the books twice.
 */
export async function resendCreditNoteToSinks(creditNoteId: string): Promise<IssueCreditNoteResult> {
  const note = await getCreditNoteById(creditNoteId)
  if (!note) return { ok: false, status: 404, error: 'Credit note not found.' }
  const invoice = await getInvoiceForOrder(note.orderId)
  const withResults = await tellTheBooks(note, invoice?.total ?? note.total)
  return { ok: true, creditNote: withResults, created: false }
}

/**
 * Raises the credit note for a refund that has just settled, and swallows
 * everything.
 *
 * The seam every settle path calls. It sits immediately after money has moved at
 * a payment provider, so there is no failure here worth surfacing to whoever
 * pressed the button: the refund stands, and a credit note that did not get
 * raised is recoverable from the order screen. Refusals that are simply "this
 * shop does not do credit notes" are not even worth a log line.
 */
export async function creditNoteForSettledRefund(
  refundId: string,
  opts?: { userId?: string | null },
): Promise<void> {
  try {
    const result = await issueCreditNoteForRefund(refundId, { issuedBy: 'AUTO', userId: opts?.userId ?? null })
    if (!result.ok && result.status >= 500) {
      console.error('[shop] no credit note raised for refund', refundId, '-', result.error)
    }
  } catch (error) {
    console.error('[shop] no credit note raised for refund', refundId, error)
  }
}
