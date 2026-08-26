// PROTECTED - the signed stand-in for putting a customer's details in an
// invoice URL.
//
// Same reasoning as lib/order-receipt-token.ts beside it, and deliberately the
// same shape: an HMAC over the invoice number alone, so the link a shop emails
// or an admin opens carries nothing personal, cannot be guessed from a
// neighbouring invoice number (they run in sequence - the number is no lock at
// all), and needs no table, no row and no expiry sweep.
//
// Not time-limited, for the same reason a receipt is not: an invoice is a thing
// people file and come back to years later, usually the week their accountant
// asks for it.
import { createHmac, timingSafeEqual } from 'crypto'

function getKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY is not set - required for invoice links.')
  return key
}

/** The token for one invoice's own link. */
export function signInvoiceToken(invoiceNumber: string): string {
  return createHmac('sha256', getKey()).update(`invoice:${invoiceNumber}`).digest('base64url')
}

/** Whether this token was issued for this invoice. Constant-time, and false for
 *  anything malformed rather than throwing - a bad link is a 404, not a 500. */
export function verifyInvoiceToken(invoiceNumber: string, token: string | null | undefined): boolean {
  if (!invoiceNumber || !token) return false
  try {
    const expected = signInvoiceToken(invoiceNumber)
    const a = Buffer.from(token)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** The site-relative address of one invoice, token and all. */
export function invoicePath(invoiceNumber: string): string {
  return `/shop/invoice/${encodeURIComponent(invoiceNumber)}?t=${signInvoiceToken(invoiceNumber)}`
}

/** The same, for a credit note. Its own namespace in the HMAC, so a token minted
 *  for invoice INV-000087 cannot open credit note INV-000087 on a shop whose two
 *  prefixes happen to collide. */
export function signCreditNoteToken(creditNoteNumber: string): string {
  return createHmac('sha256', getKey()).update(`credit-note:${creditNoteNumber}`).digest('base64url')
}

export function verifyCreditNoteToken(creditNoteNumber: string, token: string | null | undefined): boolean {
  if (!creditNoteNumber || !token) return false
  try {
    const expected = signCreditNoteToken(creditNoteNumber)
    const a = Buffer.from(token)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** The site-relative address of one credit note, token and all. */
export function creditNotePath(creditNoteNumber: string): string {
  return `/shop/credit-note/${encodeURIComponent(creditNoteNumber)}?t=${signCreditNoteToken(creditNoteNumber)}`
}

// The PDF of each, which the routes serve as an attachment. A link straight to
// one saves the file where a link to the page opens a document the reader then
// has to save for themselves - which is what somebody clicking "Invoice
// OSR-000004" in their own order history was after in the first place.
export function invoicePdfPath(invoiceNumber: string): string {
  return `/api/m/shop/public/invoices/${encodeURIComponent(invoiceNumber)}/pdf?t=${signInvoiceToken(invoiceNumber)}`
}

export function creditNotePdfPath(creditNoteNumber: string): string {
  return `/api/m/shop/public/credit-notes/${encodeURIComponent(creditNoteNumber)}/pdf?t=${signCreditNoteToken(creditNoteNumber)}`
}

// The proforma, which is keyed on the ORDER number rather than a document
// number of its own (see lib/proforma.ts for why it has none).
//
// That makes the token matter more here than anywhere else in this file, not
// less. An invoice number is sequential and guessable; an order number is
// sequential, guessable AND printed on every email the shop sends, so the
// number is no lock whatsoever. Its own namespace in the HMAC, so a token minted
// for one document can never open another that happens to share a number - which
// on a shop numbering orders "INV-000123" would otherwise be every one of them.
export function signProformaToken(orderNumber: string): string {
  return createHmac('sha256', getKey()).update(`proforma:${orderNumber}`).digest('base64url')
}

export function verifyProformaToken(orderNumber: string, token: string | null | undefined): boolean {
  if (!orderNumber || !token) return false
  try {
    const expected = signProformaToken(orderNumber)
    const a = Buffer.from(token)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** The site-relative address of one order's proforma, token and all. */
export function proformaPath(orderNumber: string): string {
  return `/shop/proforma/${encodeURIComponent(orderNumber)}?t=${signProformaToken(orderNumber)}`
}

export function proformaPdfPath(orderNumber: string): string {
  return `/api/m/shop/public/proformas/${encodeURIComponent(orderNumber)}/pdf?t=${signProformaToken(orderNumber)}`
}
