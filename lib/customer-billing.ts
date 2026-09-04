import { orderCompanyName } from '@/modules/shop/lib/order-display'
import type { ShpConfig } from '@/modules/shop/lib/config'
import type { ShpAddress, ShpInvoice, ShpOrder } from '@/modules/shop/lib/types'

// Who an order is invoiced to, and what changing it costs.
//
// The rules only - no database, no side effects - so the page that draws the
// panel and the route that accepts the change ask exactly the same questions of
// exactly the same code. A hand-rolled PATCH gets the answer a real click would
// have got, which is the same arrangement lib/customer-reference.ts is in and
// for the same reason.
//
// The whole file turns on one distinction, and it is a statutory one rather
// than a tidy one:
//
//  - THE ADDRESS MOVED. Same company, same registration, same supply. The
//    invoice is corrected in place and what it said before is kept. No new
//    number, no credit note, nothing for anybody's VAT return to notice.
//
//  - THE COMPANY CHANGED. A different legal person is being billed. That is not
//    a typo on a document, it is a different document: the one that went out is
//    credited in full and a fresh one raised to the new name. Both stay
//    downloadable for ever, because the customer's own accountant has very
//    likely already filed the first.
//
// Before an invoice exists, neither of those applies. Nothing has been sent, so
// nothing has to be undone - the order is corrected and the invoice, whenever
// it is raised, is raised correctly first time.

/** As long as the company name on an order may be. Long enough for the longest
 *  registered name Companies House will accept, which is 160 characters. */
export const BILLING_COMPANY_MAX_LENGTH = 160

/** Whether this shop offers the panel at all - asked before anything is drawn,
 *  so a shop that has never wanted it is not shown an inert box about it. */
export function customerBillingEditOffered(config: Pick<ShpConfig, 'customerBillingEditEnabled'>): boolean {
  return config.customerBillingEditEnabled
}

// Nothing left to invoice. A cancelled or refunded order is closed paperwork,
// and correcting the name on it would be tidying a document nobody is going to
// act on. Same list as the order reference's, deliberately.
const CLOSED_STATUSES = new Set(['CANCELLED', 'REFUNDED'])

/** What one company name is, for comparing two of them.
 *
 *  Case and spacing only. "acme  ltd" and "Acme Ltd" are the same firm typed by
 *  two different people, and treating them as different would credit an invoice
 *  and burn two document numbers over a capital letter. Punctuation is NOT
 *  stripped: "Acme Ltd" and "Acme Ltd." may look alike, but so do plenty of
 *  genuinely different companies, and the cost of being wrong runs in the wrong
 *  direction - a change nobody asked for, made silently to paperwork. */
export function normaliseCompanyName(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** An address as the invoice prints it, flattened for comparison. Same
 *  normalising as the name: whitespace and case, nothing cleverer. */
export function normaliseAddress(address: ShpAddress | null | undefined): string {
  if (!address) return ''
  return [
    address.firstName, address.lastName, address.line1, address.line2,
    address.city, address.county, address.postcode, address.country,
  ]
    .map((part) => (part ?? '').trim().replace(/\s+/g, ' ').toLowerCase())
    .join('|')
}

export type BillingIdentity = {
  /** The company the invoice is made out to. Blank means a private buyer. */
  organisation: string
  /** Where the paperwork goes. Null means "the delivery address", which is what
   *  an order placed without a billing address of its own already means. */
  billingAddress: ShpAddress | null
}

/** What the order says today.
 *
 *  The company through `orderCompanyName`, not straight off the column: that is
 *  the answer the invoice prints, and comparing a change against anything else
 *  would have the panel decide nothing had changed while the document said
 *  otherwise. */
export function currentBillingIdentity(
  order: Pick<ShpOrder, 'customerOrganisation' | 'billingAddress' | 'shippingAddress'>,
): BillingIdentity {
  return {
    organisation: orderCompanyName(order) ?? '',
    billingAddress: order.billingAddress ?? null,
  }
}

export type BillingEditability =
  | { allowed: true }
  | { allowed: false; reason: string }

export type BillingEligibilityInput = {
  config: Pick<ShpConfig, 'customerBillingEditEnabled' | 'customerBillingReissueEnabled' | 'invoicesEnabled' | 'creditNotesEnabled'>
  order: Pick<ShpOrder, 'status'>
}

/**
 * Whether the customer may touch their billing details on this order at all.
 *
 * Deliberately not the same question as "may they change the company", which
 * depends on what they are changing it to and on whether an invoice has gone
 * out. This one is about the order: is the shop offering it, and is there
 * still any paperwork to correct.
 */
export function customerCanEditBilling(input: BillingEligibilityInput): BillingEditability {
  if (!input.config.customerBillingEditEnabled) {
    return { allowed: false, reason: 'This shop does not take invoice changes through the website. Get in touch and we will sort it.' }
  }
  if (CLOSED_STATUSES.has(input.order.status)) {
    return { allowed: false, reason: 'This order has already been cancelled or refunded, so its paperwork is closed.' }
  }
  return { allowed: true }
}

/**
 * What actually has to happen to make a requested change true.
 *
 * The single decision this whole feature turns on, kept pure so it can be
 * tested against the cases that matter rather than reasoned about at three call
 * sites.
 *
 *  - `none`      - nothing they typed is different from what is already there.
 *  - `order`     - the order is corrected, and that is all there is to it.
 *                  Either no invoice has been raised yet, or one has and only
 *                  the address moved, in which case the document is corrected
 *                  in place too (see `amendsInvoice`).
 *  - `reissue`   - the company changed after an invoice went out. The invoice
 *                  is credited in full and a replacement raised.
 */
export type BillingChangeEffect = {
  kind: 'none' | 'order' | 'reissue'
  /** Whether the company being billed is different from the one on the order. */
  companyChanged: boolean
  /** Whether the address the paperwork goes to is different. */
  addressChanged: boolean
  /** Whether an already-issued invoice's own address has to be corrected as
   *  well. Only ever true alongside `kind: 'order'` - a reissue raises a fresh
   *  document with the new address on it and has nothing to amend. */
  amendsInvoice: boolean
}

export function billingChangeEffect(
  current: BillingIdentity,
  next: BillingIdentity,
  invoice: Pick<ShpInvoice, 'id'> | null,
): BillingChangeEffect {
  const companyChanged = normaliseCompanyName(current.organisation) !== normaliseCompanyName(next.organisation)
  const addressChanged = normaliseAddress(current.billingAddress) !== normaliseAddress(next.billingAddress)

  if (!companyChanged && !addressChanged) {
    return { kind: 'none', companyChanged, addressChanged, amendsInvoice: false }
  }
  if (companyChanged && invoice) {
    return { kind: 'reissue', companyChanged, addressChanged, amendsInvoice: false }
  }
  return {
    kind: 'order',
    companyChanged,
    addressChanged,
    amendsInvoice: Boolean(invoice) && addressChanged,
  }
}

/**
 * Whether a reissue is available on this shop, and what to say when it is not.
 *
 * Three ways it can be off, and the customer is told which. The blunt one first
 * - an owner who wants this conversation on the telephone - then the two that
 * are really "this shop is not set up for it", because a credit note is not
 * optional here: without one, replacing an invoice would leave the sale booked
 * twice and the shop paying VAT on money it never took twice over.
 */
export function reissueAvailable(
  config: Pick<ShpConfig, 'customerBillingReissueEnabled' | 'invoicesEnabled' | 'creditNotesEnabled'>,
): BillingEditability {
  if (!config.invoicesEnabled) {
    return { allowed: false, reason: 'Get in touch and we will change the name on your paperwork.' }
  }
  if (!config.customerBillingReissueEnabled) {
    return {
      allowed: false,
      reason: 'Your invoice has already gone out, so changing the company name on it is something we do by hand. Get in touch and we will sort it.',
    }
  }
  if (!config.creditNotesEnabled) {
    return {
      allowed: false,
      reason: 'Your invoice has already gone out, so changing the company name on it is something we do by hand. Get in touch and we will sort it.',
    }
  }
  return { allowed: true }
}

/**
 * The warning shown before a company change goes through, in the buyer's words.
 *
 * Written here rather than in the panel so the sentence the customer agrees to
 * and the thing the server then does come from one file. It says what will
 * happen to the document they are holding, because that is the part that
 * matters to their own accounts department - two pieces of paper where there
 * was one, and the first is not simply gone.
 */
export function reissueWarning(invoiceNumber: string, taxLabel: string): string {
  const label = taxLabel.trim() || 'VAT'
  return `Invoice ${invoiceNumber} was made out to a different company, so we cannot simply rewrite it. `
    + `We will raise a credit note cancelling it and send you a new ${label} invoice in the new name. `
    + `All three stay on this page for your records, and nothing about what you paid changes.`
}
