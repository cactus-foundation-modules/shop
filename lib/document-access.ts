// PROTECTED - who may open an invoice, a credit note or a proforma.
//
// These three are the shop's paperwork, and each one carries a customer's name,
// the address it is billed to, every line they bought and what they paid. They
// used to open for anyone holding their signed link, which made the link itself
// the whole lock: a permanent one, sitting in a mail archive, in whatever chat
// it was forwarded to, and in the history of every browser it was ever opened
// in. The token is still what says WHICH document; it is no longer what says
// the reader may see it.
//
// The rule is the order's own (lib/order-viewer.ts): signed in as its owner,
// signed in as staff, or having proved the delivery postcode in this browser.
// Anybody else holding a genuine link is asked for the postcode, in place, and
// then goes straight through - see app/api/public/documents/access.
//
// TWO CALLERS, AND ONE DIFFERENCE BETWEEN THEM
//
// `allowReceiptCookie` is honoured by the PDF routes and NOT by the pages, and
// the reason is core's page cache rather than anything about trust. A rendered
// public page is given a shared-cache header by proxy.ts unless the request
// carries one of the declared cache-bypass cookies; the cache key is the URL,
// which for these documents is the same URL for everybody. A session, a member
// session and `cactus_shop_order_access` are all bypass cookies, so a request
// allowed by any of those is never cached and can never be handed to the next
// reader. `cactus_shop_receipt` deliberately is NOT one (see that file for what
// declaring it would cost every returning shopper), so a page rendered on its
// strength could be cached and served to whoever held the link - which is the
// exact hole this whole change exists to close.
//
// A module API route is never touched by that cache, so the PDF routes can
// honour it safely, and they do: the customer who has just paid by bank transfer
// and wants the proforma from their own confirmation page should not be asked
// for the postcode of an address they typed ninety seconds ago.
import { getSessionFromCookie } from '@/lib/auth/session'
import { getMemberFromCookie } from '@/lib/members/session'
import { getCreditNoteByNumber } from '@/modules/shop/lib/db/credit-notes'
import { getInvoiceByNumber } from '@/modules/shop/lib/db/invoices'
import { getOrderById, getOrderByNumber } from '@/modules/shop/lib/db/orders'
import { guestOrderAccessIds } from '@/modules/shop/lib/guest-order-access'
import { receiptAccessNumbers } from '@/modules/shop/lib/receipt-access-cookie'
import {
  documentPagePath,
  verifyDocumentPrintToken,
  type ShopDocumentKind,
} from '@/modules/shop/lib/document-print-token'
import {
  verifyCreditNoteToken,
  verifyInvoiceToken,
  verifyProformaToken,
} from '@/modules/shop/lib/invoice-token'
import { receiptChallengeFor, type ReceiptChallenge } from '@/modules/shop/lib/order-receipt-challenge'
import type { ShpOrder } from '@/modules/shop/lib/types'

export type { ShopDocumentKind }
/** Re-exported so a caller that has the access rule in hand does not need both
 *  imports. It lives with the print token - see there for why. */
export { documentPagePath }

/** Whether this is the permanent link token for this document. One place, so a
 *  new document kind cannot be added with the wrong namespace by accident. */
export function verifyDocumentLinkToken(
  kind: ShopDocumentKind,
  number: string,
  token: string | null | undefined,
): boolean {
  if (kind === 'invoice') return verifyInvoiceToken(number, token)
  if (kind === 'credit-note') return verifyCreditNoteToken(number, token)
  return verifyProformaToken(number, token)
}

/**
 * The order a document belongs to, whatever it is numbered by.
 *
 * A proforma is numbered by its ORDER - it is a statement about an order that
 * has not been invoiced yet - while an invoice and a credit note carry numbers
 * of their own. Null when there is no such document, or when the order behind
 * one has since been deleted.
 */
export async function documentOrder(kind: ShopDocumentKind, number: string): Promise<ShpOrder | null> {
  if (kind === 'proforma') return getOrderByNumber(number)
  const orderId = kind === 'invoice'
    ? (await getInvoiceByNumber(number))?.orderId
    : (await getCreditNoteByNumber(number))?.orderId
  return orderId ? getOrderById(orderId) : null
}

export type DocumentAccess = {
  allowed: boolean
  /** What to ask for, when the reader holds a genuine link but has not proved
   *  themselves. Null means show them nothing at all: no link, no order, or
   *  a token that does not check out. */
  challenge: ReceiptChallenge | null
}

const REFUSED: DocumentAccess = { allowed: false, challenge: null }

export async function resolveDocumentAccess(params: {
  kind: ShopDocumentKind
  /** The document's own number, as it appears in its address. */
  number: string
  /** Whatever arrived as `?t=` - either the permanent link token or the
   *  short-lived one a print job carries. */
  token: string | null
  /** The order behind it, already in hand at every call site. */
  order: Pick<ShpOrder, 'id' | 'memberId' | 'orderNumber' | 'customerEmail' | 'shippingAddress'> | null
  /** PDF routes only. See the note at the top of this file. */
  allowReceiptCookie?: boolean
}): Promise<DocumentAccess> {
  const { kind, number, token, order, allowReceiptCookie = false } = params

  // The printing browser, which has no session and never will. Short-lived and
  // minted for this one document - see lib/document-print-token.ts.
  if (verifyDocumentPrintToken(kind, number, token)) return { allowed: true, challenge: null }

  if (!order) return REFUSED

  const [member, user, guestOrderIds] = await Promise.all([
    getMemberFromCookie(),
    getSessionFromCookie(),
    guestOrderAccessIds(),
  ])

  // Staff. A shop's own people open their customers' paperwork from the order
  // screen, and always could.
  if (user) return { allowed: true, challenge: null }
  if (member && order.memberId === member.id) return { allowed: true, challenge: null }
  if (guestOrderIds.includes(order.id)) return { allowed: true, challenge: null }
  if (allowReceiptCookie && (await receiptAccessNumbers()).includes(order.orderNumber)) {
    return { allowed: true, challenge: null }
  }

  // Not allowed. A genuine link earns the reader the question; anything else is
  // told nothing, because these numbers run in sequence and "wrong token" and
  // "not yours" must look identical from outside.
  if (!verifyDocumentLinkToken(kind, number, token)) return REFUSED
  return { allowed: false, challenge: receiptChallengeFor(order) }
}
