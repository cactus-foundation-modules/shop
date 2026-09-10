// PROTECTED - the credential that lets the printing browser open one of the
// shop's document pages.
//
// The three customer documents - invoice, credit note, proforma - are printed by
// fetching their own page over HTTP from the site's public address, because that
// is the only way the PDF and the page can be certain to agree. That request
// carries no session cookie and belongs to nobody, so something has to open the
// door for it, for as long as the print takes and no longer.
//
// It used to be the document's permanent link token (lib/invoice-token.ts) that
// did that, which quietly made the permanent token sufficient on its own: add
// `&print=1` to any invoice link and the whole document came back, forwarded
// copies included. The permanent token now names the document and earns the
// reader a postcode challenge; THIS one, which nobody outside a print job ever
// holds, is what opens it without asking.
//
// The kind is inside the HMAC as well as the number, so a token minted to print
// a credit note cannot open the invoice it credits on a shop whose two
// numbering prefixes happen to collide.
import { createHmac, timingSafeEqual } from 'crypto'

export type ShopDocumentKind = 'invoice' | 'credit-note' | 'proforma'

/** Where each document's own page lives. Here rather than beside the access rule
 *  because the things that PRINT these documents need it and must not drag a
 *  database module in behind it - lib/document-access.ts imports the invoice and
 *  credit-note tables, and those files import this path back. */
export function documentPagePath(kind: ShopDocumentKind, number: string): string {
  const slug = kind === 'invoice' ? 'invoice' : kind === 'credit-note' ? 'credit-note' : 'proforma'
  return `/shop/${slug}/${encodeURIComponent(number)}`
}

/** Long enough for a slow print on a cold serverless instance, short enough that
 *  a link pasted into a chat has stopped working by the time anybody clicks it.
 *  The same half hour purchase-orders settled on for the same job. */
export const PRINT_TOKEN_TTL_MINUTES = 30

function getKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY is not set - required for shop document printing.')
  return key
}

function digest(kind: ShopDocumentKind, number: string, expiresAtMinute: number): string {
  return createHmac('sha256', getKey())
    .update(`doc-print:${kind}:${number}:${expiresAtMinute}`)
    .digest('base64url')
}

/**
 * A token for one document, good for `PRINT_TOKEN_TTL_MINUTES`.
 *
 * The expiry is carried in the token rather than stored, so there is no table to
 * sweep and no row to leak. It is inside the HMAC, so it cannot be moved.
 */
export function signDocumentPrintToken(
  kind: ShopDocumentKind,
  number: string,
  ttlMinutes = PRINT_TOKEN_TTL_MINUTES,
): string {
  const expiresAtMinute = Math.floor(Date.now() / 60_000) + Math.max(1, Math.trunc(ttlMinutes))
  return `${expiresAtMinute}.${digest(kind, number, expiresAtMinute)}`
}

/** Whether this token was issued to print this document and has not aged out.
 *  Constant-time, and false for anything malformed rather than throwing - a bad
 *  link is a 404, not a 500. */
export function verifyDocumentPrintToken(
  kind: ShopDocumentKind,
  number: string,
  token: string | null | undefined,
): boolean {
  if (!number || !token) return false
  const dot = token.indexOf('.')
  if (dot < 1) return false
  const expiresAtMinute = Number(token.slice(0, dot))
  if (!Number.isSafeInteger(expiresAtMinute)) return false
  // Checked BEFORE the comparison, so an expired token costs no HMAC at all.
  if (expiresAtMinute < Math.floor(Date.now() / 60_000)) return false
  try {
    const a = Buffer.from(digest(kind, number, expiresAtMinute))
    const b = Buffer.from(token.slice(dot + 1))
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
