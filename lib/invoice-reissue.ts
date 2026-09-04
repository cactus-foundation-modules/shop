import { prisma } from '@/lib/db/prisma'
import { getSiteUrl } from '@/lib/config/env'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getOrderById, setOrderBillingIdentity } from '@/modules/shop/lib/db/orders'
import {
  amendInvoiceBillingAddress,
  getInvoiceById,
  getInvoiceForOrder,
  insertInvoice,
  linkSupersedingInvoice,
  saveSinkResults,
  supersedeInvoice,
} from '@/modules/shop/lib/db/invoices'
import { insertCreditNote, listCreditNotesForOrder } from '@/modules/shop/lib/db/credit-notes'
import { markRefundsNettedOff } from '@/modules/shop/lib/db/refunds'
import { buildFullCreditNoteInput, tellTheBooks } from '@/modules/shop/lib/credit-notes'
import { generateCreditNoteNumber } from '@/modules/shop/lib/credit-note-number'
import {
  buildInvoiceInsertInput,
  dateInZone,
  invoiceSinkPayload,
  siteTimezone,
} from '@/modules/shop/lib/invoices'
import { dispatchInvoiceIssued } from '@/modules/shop/lib/invoice-sinks'
import { creditNotePath, invoicePath } from '@/modules/shop/lib/invoice-token'
import { creditNoteEmailAttachment, invoiceEmailAttachment } from '@/modules/shop/lib/invoice-attachment'
import { sendShopEmail } from '@/modules/shop/lib/email'
import { addressLines } from '@/modules/shop/lib/order-display'
import {
  billingChangeEffect,
  currentBillingIdentity,
  customerCanEditBilling,
  reissueAvailable,
  type BillingIdentity,
} from '@/modules/shop/lib/customer-billing'
import type { EmailAttachment } from '@/lib/email/index'
import type { ShpCreditNote, ShpInvoice } from '@/modules/shop/lib/types'

// Changing who an order is invoiced to, once it has been invoiced.
//
// The one place it happens, for the same reason lib/invoices.ts is the one
// place an invoice is raised: there is a right way to do this and it must not
// have three versions. The customer's order page reaches it today; the admin
// order screen is the obvious second caller.
//
// What it does, and why it is not simply an UPDATE:
//
//  - The address moved and the company did not. Same party, same supply, same
//    tax point - nothing about the sale has changed, so the document is
//    corrected in place and what it used to say is kept beside it. No number is
//    burnt and no VAT return is reopened over a postcode.
//
//  - The company changed. A different legal person is being billed, and no
//    amount of goodwill makes that an edit. The invoice that went out is
//    credited IN FULL, marked as superseded, and a replacement raised to the
//    new name. Three documents where there was one, all of them downloadable
//    for ever, because the customer's own accountant has very likely filed the
//    first already.
//
// The three writes in that second case go in ONE transaction. Half of it is the
// state nobody could untangle afterwards: an order carrying a credited invoice
// and no live one, or two live invoices for one sale. The sinks and the email
// come after the commit, where a failure costs a retry rather than the books.

export type BillingChangeResult =
  | {
      ok: true
      /** What actually happened, for the sentence the page prints back. */
      outcome: 'unchanged' | 'order' | 'amended' | 'reissued'
      invoice: ShpInvoice | null
      creditNote: ShpCreditNote | null
      /** The invoice that was credited, on a reissue. */
      supersededInvoice: ShpInvoice | null
    }
  | { ok: false; status: number; error: string }

/**
 * Applies a requested change of billing company and address to an order.
 *
 * Never throws at its callers. Every refusal is a sentence somebody can read.
 *
 * `confirmedReissue` is the customer having been shown what a company change
 * costs and having said yes. Without it, a change that would credit and replace
 * an invoice is refused rather than done quietly - two documents arriving in
 * somebody's inbox unannounced is how a buyer's finance team concludes they
 * have been double-charged.
 */
export async function changeOrderBillingIdentity(
  orderId: string,
  next: BillingIdentity,
  opts: { by: 'CUSTOMER' | 'STAFF'; userId?: string | null; confirmedReissue?: boolean },
): Promise<BillingChangeResult> {
  try {
    const [config, order] = await Promise.all([getShopConfigCached(), getOrderById(orderId)])
    if (!order) return { ok: false, status: 404, error: 'Order not found.' }

    // Staff are gated by their own permission on the route; the shop's setting
    // is about what the CUSTOMER may do unaided.
    if (opts.by === 'CUSTOMER') {
      const editable = customerCanEditBilling({ config, order })
      if (!editable.allowed) return { ok: false, status: 409, error: editable.reason }
    }

    // ISSUED and not already superseded - the document the customer is holding.
    const invoice = config.invoicesEnabled ? await getInvoiceForOrder(order.id) : null
    const effect = billingChangeEffect(currentBillingIdentity(order), next, invoice)

    if (effect.kind === 'none') {
      return { ok: true, outcome: 'unchanged', invoice, creditNote: null, supersededInvoice: null }
    }

    if (effect.kind === 'order') {
      const saved = await setOrderBillingIdentity(order.id, next)
      if (!saved) return { ok: false, status: 404, error: 'Order not found.' }

      // The invoice already sent, corrected to the new address. Deliberately
      // after the order write and deliberately not fatal: the order is the live
      // record, and a document that could not be corrected is a support ticket
      // rather than a lost change.
      if (effect.amendsInvoice && invoice) {
        const lines = next.billingAddress ? addressLines(next.billingAddress) : addressLines(order.shippingAddress)
        const amended = await amendInvoiceBillingAddress(invoice.id, lines, opts.by)
        if (!amended) {
          console.error('[shop] billing address saved on order', order.id, 'but invoice', invoice.invoiceNumber, 'could not be corrected')
        }
        return {
          ok: true,
          outcome: 'amended',
          invoice: await getInvoiceById(invoice.id),
          creditNote: null,
          supersededInvoice: null,
        }
      }

      return { ok: true, outcome: 'order', invoice, creditNote: null, supersededInvoice: null }
    }

    // From here down: the company changed and an invoice has gone out.
    if (!invoice) return { ok: false, status: 500, error: 'That change could not be worked out. Please try again.' }

    const available = reissueAvailable(config)
    if (!available.allowed) return { ok: false, status: 409, error: available.reason }
    if (!opts.confirmedReissue) {
      return { ok: false, status: 409, error: 'That change needs confirming first.' }
    }

    // An invoice that has already been credited in part - a refund went through
    // against it - is not one to replace. The replacement would be raised for
    // the full amount, and the money handed back would then be credited twice.
    // Rare, and rightly a conversation rather than a button.
    const existingCredits = await listCreditNotesForOrder(order.id)
    if (existingCredits.some((note) => note.invoiceId === invoice.id)) {
      return {
        ok: false,
        status: 409,
        error: 'There is already a credit note against this invoice, so changing the company name is something we need to do by hand. Get in touch and we will sort it.',
      }
    }

    return await reissue(order.id, invoice, next, opts)
  } catch (error) {
    console.error('[shop] could not change the billing details on order', orderId, error)
    return { ok: false, status: 500, error: 'That change could not be saved. Please try again.' }
  }
}

/** The company change itself: order corrected, invoice credited and superseded,
 *  replacement raised - all in one transaction - then the books and the
 *  customer told. */
async function reissue(
  orderId: string,
  invoice: ShpInvoice,
  next: BillingIdentity,
  opts: { by: 'CUSTOMER' | 'STAFF'; userId?: string | null },
): Promise<BillingChangeResult> {
  const config = await getShopConfigCached()
  const timezone = await siteTimezone()

  // The order has to carry the new details before the replacement is built:
  // buildInvoiceInsertInput reads the order, which is the whole reason the new
  // document comes out in the new name.
  const saved = await setOrderBillingIdentity(orderId, next)
  if (!saved) return { ok: false, status: 404, error: 'Order not found.' }

  const order = await getOrderById(orderId)
  if (!order) return { ok: false, status: 404, error: 'Order not found.' }

  const oldCompany = invoice.customer?.company?.trim() || invoice.customer?.name?.trim() || 'the previous name'
  const newCompany = next.organisation.trim() || order.customerName
  const reason = `Invoice ${invoice.invoiceNumber} was made out to ${oldCompany}. Replaced by an invoice to ${newCompany}.`

  // Numbers come from sequences, so they are minted outside the transaction:
  // nextval does not roll back, and a rolled-back attempt spending a number is
  // a gap in the run rather than a collision in it - which is the trade this
  // module has made everywhere else too.
  const [creditNoteNumber, replacementBuild] = await Promise.all([
    generateCreditNoteNumber(),
    buildInvoiceInsertInput(order, config, {
      trigger: 'REISSUE',
      issuedBy: opts.by === 'STAFF' ? 'MANUAL' : 'AUTO',
      userId: opts.userId ?? null,
      timezone,
      // The replacement says what the original said, so it is netted of exactly
      // the refunds the original was netted of - which is what letting that
      // invoice's own marks back in means. Anything refunded since has a credit
      // note against the original and is dealt with there.
      alsoNettedOffInvoiceId: invoice.id,
    }),
  ])

  const creditInput = buildFullCreditNoteInput(invoice, config, {
    creditNoteNumber,
    // The tax point of the CREDIT is today, not the day of the sale: the
    // quarter the invoice fell in has very likely been filed, and reopening it
    // is not this feature's business. The replacement keeps the sale's own tax
    // point (see buildInvoiceInsertInput), so the two land in the same return
    // and net each other off there.
    taxPointDate: dateInZone(new Date(), timezone),
    reason,
    issuedBy: opts.by === 'STAFF' ? 'MANUAL' : 'AUTO',
    userId: opts.userId ?? null,
  })

  let creditNote: ShpCreditNote
  let replacement: ShpInvoice
  try {
    ;({ creditNote, replacement } = await prisma.$transaction(async (tx) => {
      const note = await insertCreditNote(creditInput, tx)
      // Guarded on the invoice still being live, so two people pressing at once
      // cannot both go on to raise a replacement: the loser's UPDATE matches
      // nothing and the whole transaction is thrown away.
      const marked = await supersedeInvoice(invoice.id, reason, tx)
      if (!marked) throw new Error('invoice was no longer live')
      const fresh = await insertInvoice(replacementBuild.input, tx)
      await linkSupersedingInvoice(invoice.id, fresh.id, tx)
      return { creditNote: note, replacement: fresh }
    }, { timeout: 15_000 }))
  } catch (error) {
    console.error('[shop] could not reissue the invoice for order', orderId, error)
    // Nothing was written - that is what the transaction is for - but the order
    // now carries the new company with the old invoice still live against it.
    // Correct as far as it goes: the invoice says what it said on the day, and
    // pressing again will replace it.
    return { ok: false, status: 500, error: 'Your details are saved, but the new invoice could not be raised. Get in touch and we will send it over.' }
  }

  // The netting marks move to the document that now carries them, so the refunds
  // the original was raised without stay dealt-with rather than reappearing as
  // credit notes waiting to be raised against an invoice that no longer stands.
  await markRefundsNettedOff(replacementBuild.nettedRefundIds, replacement.id).catch((error) => {
    console.error('[shop] could not move netting marks to invoice', replacement.invoiceNumber, error)
  })

  // Past the point of no return for the paperwork. Everything below is telling
  // people about it, and none of it may undo any of the above.
  await tellTheBooks(creditNote, invoice.total).catch((error) => {
    console.error('[shop] credit note', creditNote.creditNoteNumber, 'did not reach the books:', error)
  })

  const settledDate = order.paidAt ? dateInZone(order.paidAt, timezone) : null
  const results = await dispatchInvoiceIssued(invoiceSinkPayload(replacement, order.orderNumber, settledDate))
    .catch((error) => {
      console.error('[shop] replacement invoice', replacement.invoiceNumber, 'did not reach the books:', error)
      return []
    })
  if (results.length > 0) {
    await saveSinkResults(replacement.id, results).catch(() => {})
    replacement = { ...replacement, sinkResults: results }
  }

  await emailTheCustomer(order.customerEmail, {
    customerName: order.customerName,
    orderNumber: order.orderNumber,
    companyName: newCompany,
    oldInvoiceNumber: invoice.invoiceNumber,
    creditNoteNumber: creditNote.creditNoteNumber,
    newInvoiceNumber: replacement.invoiceNumber,
    orderId: order.id,
  })

  return {
    ok: true,
    outcome: 'reissued',
    invoice: replacement,
    creditNote,
    supersededInvoice: await getInvoiceById(invoice.id),
  }
}

/** Tells the customer what has just landed in their records.
 *
 *  One email covering both documents, never the credit note's own: a bare
 *  "credit note issued" says money is coming back, and nothing is coming back
 *  here. Never fails the change - the documents are raised and on their order
 *  page either way.
 *
 *  Both files travel with it. The credit note matters as much as the
 *  replacement does - it is what cancels the invoice the buyer's accounts
 *  department has already filed - and sending one without the other leaves them
 *  holding a second invoice for the same sale and no paper saying the first is
 *  dead. Printed in parallel because each one is a headless browser, and either
 *  may come back null (setting off, PDFs off, printer having a bad day) without
 *  stopping the email or the other file. */
async function emailTheCustomer(
  to: string,
  vars: {
    customerName: string
    orderNumber: string
    companyName: string
    oldInvoiceNumber: string
    creditNoteNumber: string
    newInvoiceNumber: string
    orderId: string
  },
): Promise<void> {
  const address = to?.trim()
  if (!address) return
  try {
    const config = await getShopConfigCached()
    const siteUrl = getSiteUrl()
    const [invoiceFile, creditNoteFile] = await Promise.all([
      invoiceEmailAttachment(vars.orderId, config),
      creditNoteEmailAttachment(vars.creditNoteNumber, config),
    ])
    const attachments = [invoiceFile, creditNoteFile].filter((file): file is EmailAttachment => file !== null)
    await sendShopEmail(
      'INVOICE_REISSUED',
      address,
      {
        customerName: vars.customerName,
        orderNumber: vars.orderNumber,
        companyName: vars.companyName,
        oldInvoiceNumber: vars.oldInvoiceNumber,
        creditNoteNumber: vars.creditNoteNumber,
        invoiceNumber: vars.newInvoiceNumber,
        // Still passed though the default wording no longer links either
        // document: an owner who has already edited this email keeps whatever
        // they put in it, rather than having their links render empty.
        invoiceUrl: siteUrl ? `${siteUrl}${invoicePath(vars.newInvoiceNumber)}` : '',
        creditNoteUrl: siteUrl ? `${siteUrl}${creditNotePath(vars.creditNoteNumber)}` : '',
        hasInvoicePdf: invoiceFile ? 'true' : 'false',
        hasCreditNotePdf: creditNoteFile ? 'true' : 'false',
      },
      { orderId: vars.orderId, ...(attachments.length ? { attachments } : {}) },
    )
  } catch (error) {
    console.error('[shop] could not email the replacement invoice for order', vars.orderNumber, error)
  }
}
