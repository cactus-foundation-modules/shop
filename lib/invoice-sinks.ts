import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import type { ShpInvoiceSinkResult, ShpInvoiceTaxRow, ShpLedgerItem } from '@/modules/shop/lib/types'

// `shop.invoice-issued` and `shop.invoice-voided` - the seam a bookkeeping
// module hangs off.
//
// Shop knows nothing about bookkeeping, VAT schemes, chart-of-accounts codes or
// HMRC, and this file is what keeps it that way. When an invoice is issued, shop
// hands a plain, serialisable statement of fact to every module that registered
// at the point and records what each one said. A shop with no such module
// installed gathers nothing and does nothing - no query, no branch, no setting.
//
// The payload is the contract. It is deliberately flat and self-describing: the
// module on the other end must never have to import a shop type, because it
// does not depend on shop and its files still have to compile on a site where
// this module is absent. Net/tax/gross per rate is the part that matters - it
// is what a VAT return is worked out from, and shop is the only thing that
// knows how the money was actually charged.
//
// Adding a field is safe. Renaming or repurposing one is not: a module built
// against the old shape is out there on somebody's site, so an incompatible
// change needs a new point name.
//
// The second point exists because an invoice that is withdrawn is not simply an
// invoice that was never raised. Something on the other side has already put the
// sale in a set of books and worked VAT out on it, and nothing but a message
// saying so will take it back out again. Voiding without telling the books is
// how a shop ends up paying VAT on a sale it withdrew.
//
// The third is the same fault at a smaller scale, and a much commoner one. A
// refund does not withdraw an invoice - the sale happened, most of it stands -
// but the money that went back is no longer turnover and the VAT inside it is no
// longer owed. Refunding without telling the books leaves a shop paying HMRC tax
// on money it handed to a customer, every time, for as long as nobody notices.
// `shop.invoice-credited` is the credit note saying so.

export type ShopInvoiceSinkPayload = {
  /** Always 'shop'. A recorder may register at more than one publisher's point
   *  and needs to say where a record came from. */
  source: 'shop'
  invoiceId: string
  invoiceNumber: string
  orderId: string
  orderNumber: string
  /** ISO timestamp of issue. */
  issuedAt: string
  /** yyyy-mm-dd. The date the VAT belongs to. */
  taxPointDate: string
  /** yyyy-mm-dd the order was paid, or null if it has not been. */
  settledDate: string | null
  currency: string
  taxMode: 'INCLUSIVE' | 'EXCLUSIVE'
  customer: { name: string; company: string; email: string }
  /** The whole invoice: net, tax and gross as decimal strings. */
  totals: { net: string; tax: string; gross: string }
  /** Net, tax and gross at each rate, summing to `totals`. */
  taxBreakdown: ShpInvoiceTaxRow[]
  /** The same money itemised: one row per thing sold, plus delivery and any
   *  rounding penny as rows of their own, summing EXACTLY to `taxBreakdown`.
   *
   *  Here so a set of books can record what was on the invoice instead of one
   *  lump per VAT rate - an accountant reading the entry sees the goods, and a
   *  category can eventually be picked per line rather than per document.
   *
   *  Empty when the rows could not be made to tie to the rate summary to the
   *  penny. A recorder must treat empty as "no itemisation available" and fall
   *  back to `taxBreakdown`, never as "the invoice came to nothing". */
  items: ShpLedgerItem[]
  /** A sentence for the entry's description, already written in English. */
  description: string
  /** Absolute, signed link to the invoice document, for filing as evidence.
   *  Null if the site has no address configured. */
  documentUrl: string | null
  /** The invoice as a file, for a recorder that keeps evidence of its own - a
   *  set of books has to be able to show HMRC the document behind an entry, and
   *  a link is not that: it dies with the shop, the token or the site.
   *
   *  Lazy on purpose. Printing runs a headless browser, and a recorder that does
   *  not file evidence must not pay for one. The only field on this payload that
   *  is a function rather than a fact: sinks are called in-process, so handing
   *  the bytes over directly beats making the other module fetch the site's own
   *  URL back over HTTP - which needs a token, meets the PDF route's rate limit,
   *  and breaks outright behind deployment protection.
   *
   *  Returns null rather than throwing when the shop has PDFs switched off or
   *  the browser could not be started. */
  document?: ShopInvoiceDocument
}

export type ShopInvoiceDocument = {
  filename: string
  mimeType: 'application/pdf'
  bytes: () => Promise<Buffer | null>
}

/** What a registered module does with one. Never throws in the caller's face -
 *  see dispatchInvoiceIssued, which treats a throw as a failed sink rather than
 *  a failed invoice. */
export type ShopInvoiceSink = (
  payload: ShopInvoiceSinkPayload,
) => Promise<{ ok: boolean; message: string }> | { ok: boolean; message: string }

/** The matching statement when one is withdrawn. Carries enough to find the
 *  record the issued payload created - the invoice number is what a recorder
 *  files it under - and enough to reverse it without asking shop anything. */
export type ShopInvoiceVoidedPayload = {
  source: 'shop'
  invoiceId: string
  invoiceNumber: string
  orderId: string
  orderNumber: string
  /** ISO timestamp the invoice was originally issued. */
  issuedAt: string
  /** ISO timestamp it was withdrawn. */
  voidedAt: string
  /** Why, in the words the person who did it typed. Never blank - the shop
   *  refuses to void without one. */
  reason: string
  /** yyyy-mm-dd the VAT belonged to, as the original said. */
  taxPointDate: string
  currency: string
  /** What the original invoice came to, so a recorder can say what it undid. */
  totals: { net: string; tax: string; gross: string }
  taxBreakdown: ShpInvoiceTaxRow[]
  description: string
}

export type ShopInvoiceVoidSink = (
  payload: ShopInvoiceVoidedPayload,
) => Promise<{ ok: boolean; message: string }> | { ok: boolean; message: string }

/** The statement when part or all of an invoice is credited back.
 *
 *  Deliberately NOT a void with a smaller number on it. A void says the sale
 *  never stood; this says it stood and some of it has since been handed back,
 *  which is a different entry in anybody's books and a different document in the
 *  customer's file. It carries its own number because a credit note is a
 *  document in its own right, and it names the invoice it credits because a
 *  credit note that does not is not one.
 *
 *  Every figure is a POSITIVE magnitude - what was credited, not a negative
 *  sale. The recorder negates, exactly as it already does for a void. */
export type ShopInvoiceCreditedPayload = {
  source: 'shop'
  creditNoteId: string
  creditNoteNumber: string
  /** The invoice being credited. Its number is what a recorder filed the sale
   *  under, so it is how the two are tied together. */
  invoiceId: string | null
  invoiceNumber: string
  orderId: string
  orderNumber: string
  /** ISO timestamp the credit note was raised. */
  issuedAt: string
  /** yyyy-mm-dd. The tax point of the CREDIT - the day the money went back, not
   *  the day of the sale. A credit dated back into the quarter the sale was in
   *  would reopen a return that has very likely already been filed. */
  taxPointDate: string
  currency: string
  taxMode: 'INCLUSIVE' | 'EXCLUSIVE'
  customer: { name: string; company: string; email: string }
  /** What was credited: net, tax and gross, all positive. */
  totals: { net: string; tax: string; gross: string }
  /** The same at each rate, summing to `totals`. Rates are the ones the lines
   *  were SOLD at, not whatever the tax table says today. */
  taxBreakdown: ShpInvoiceTaxRow[]
  /** The same money itemised: one row per thing sold, plus delivery and any
   *  rounding penny as rows of their own, summing EXACTLY to `taxBreakdown`.
   *
   *  Here so a set of books can record what was on the invoice instead of one
   *  lump per VAT rate - an accountant reading the entry sees the goods, and a
   *  category can eventually be picked per line rather than per document.
   *
   *  Empty when the rows could not be made to tie to the rate summary to the
   *  penny. A recorder must treat empty as "no itemisation available" and fall
   *  back to `taxBreakdown`, never as "the invoice came to nothing". */
  items: ShpLedgerItem[]
  /** Whether this credits the whole invoice or part of it. A recorder may want
   *  to word its entry differently; nothing else turns on it. */
  full: boolean
  /** Why the money went back, in the words whoever refunded it typed. May be
   *  blank - a refund does not insist on a reason the way a void does. */
  reason: string
  description: string
  documentUrl: string | null
  /** The credit note as a file, for a recorder that keeps its own evidence.
   *  Lazy for the same reason the invoice's is: printing runs a headless
   *  browser and most recorders will not want one. */
  document?: ShopInvoiceDocument
}

export type ShopInvoiceCreditSink = (
  payload: ShopInvoiceCreditedPayload,
) => Promise<{ ok: boolean; message: string }> | { ok: boolean; message: string }

const POINT = 'shop.invoice-issued'
const VOID_POINT = 'shop.invoice-voided'
const CREDIT_POINT = 'shop.invoice-credited'

type ExtensionPointEntry = { point: string; id: string }

async function gatherSinks<T>(point: string): Promise<{ id: string; sink: T }[]> {
  const fns = moduleExtensionPointComponents[point] ?? {}
  if (Object.keys(fns).length === 0) return []
  const modules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { name: true, manifest: true },
  })
  const gathered: { id: string; sink: T }[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== point) continue
      const fn = fns[entry.id] as T | undefined
      if (fn) gathered.push({ id: entry.id, sink: fn })
    }
  }
  return gathered
}

/** Whether anything is listening at all, for the admin screen to decide whether
 *  a "send to the books again" button makes any sense. */
export async function hasInvoiceSinks(): Promise<boolean> {
  return (await gatherSinks<ShopInvoiceSink>(POINT)).length > 0
}

/** The same question for credit notes, so the order screen only offers a "send
 *  it to the books again" button where there are books to send it to. */
export async function hasCreditSinks(): Promise<boolean> {
  return (await gatherSinks<ShopInvoiceCreditSink>(CREDIT_POINT)).length > 0
}

/**
 * Hands one issued invoice to every registered sink and reports what each said.
 *
 * A sink that fails NEVER fails the invoice. The order has been paid and the
 * paperwork is raised; a bookkeeping module that is mid-VAT-return, or simply
 * broken, must not roll that back or block the status change that caused it.
 * The failure is recorded on the invoice instead, where the owner can see it
 * and press the button again.
 */
export async function dispatchInvoiceIssued(payload: ShopInvoiceSinkPayload): Promise<ShpInvoiceSinkResult[]> {
  const sinks = await gatherSinks<ShopInvoiceSink>(POINT)
  const results: ShpInvoiceSinkResult[] = []
  for (const { id, sink } of sinks) {
    const at = new Date().toISOString()
    try {
      const outcome = await sink(payload)
      results.push({ id, ok: Boolean(outcome?.ok), message: String(outcome?.message ?? '').slice(0, 500), at })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[shop] invoice sink "${id}" failed for ${payload.invoiceNumber}:`, message)
      results.push({ id, ok: false, message: message.slice(0, 500), at })
    }
  }
  return results
}

/**
 * Tells every registered sink that an invoice has been withdrawn.
 *
 * Same rules as issuing: a sink that fails never fails the void. The invoice is
 * withdrawn either way - the document says so on its face - and a bookkeeping
 * module that was down at the wrong moment must not be able to hold the shop's
 * paperwork hostage. What it said is recorded on the invoice, and the order
 * screen offers the button again.
 */
export async function dispatchInvoiceVoided(payload: ShopInvoiceVoidedPayload): Promise<ShpInvoiceSinkResult[]> {
  const sinks = await gatherSinks<ShopInvoiceVoidSink>(VOID_POINT)
  const results: ShpInvoiceSinkResult[] = []
  for (const { id, sink } of sinks) {
    const at = new Date().toISOString()
    try {
      const outcome = await sink(payload)
      results.push({ id, ok: Boolean(outcome?.ok), message: String(outcome?.message ?? '').slice(0, 500), at })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[shop] invoice void sink "${id}" failed for ${payload.invoiceNumber}:`, message)
      results.push({ id, ok: false, message: message.slice(0, 500), at })
    }
  }
  return results
}

/**
 * Tells every registered sink that part or all of an invoice has been credited.
 *
 * Same rules as the other two: a sink that fails never fails the credit note.
 * The money has already gone back to the customer and the document is raised;
 * a bookkeeping module that was down at the wrong moment must not be able to
 * hold that up. What it said is recorded on the credit note, and the order
 * screen offers the button again.
 */
export async function dispatchInvoiceCredited(payload: ShopInvoiceCreditedPayload): Promise<ShpInvoiceSinkResult[]> {
  const sinks = await gatherSinks<ShopInvoiceCreditSink>(CREDIT_POINT)
  const results: ShpInvoiceSinkResult[] = []
  for (const { id, sink } of sinks) {
    const at = new Date().toISOString()
    try {
      const outcome = await sink(payload)
      results.push({ id, ok: Boolean(outcome?.ok), message: String(outcome?.message ?? '').slice(0, 500), at })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[shop] invoice credit sink "${id}" failed for ${payload.creditNoteNumber}:`, message)
      results.push({ id, ok: false, message: message.slice(0, 500), at })
    }
  }
  return results
}
