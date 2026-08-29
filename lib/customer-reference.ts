import type { ShpConfig } from '@/modules/shop/lib/config'
import type { ShpOrder } from '@/modules/shop/lib/types'

// The customer's OWN reference for an order - their purchase order number,
// their job number, whatever their finance team has to see before they will pay
// it. Asked for at checkout (see the contact step), and, where the owner allows
// it, added or corrected by the customer afterwards from their own order page.
//
// Why afterwards matters: a business buyer very often does not have the number
// on the day. They buy, their own finance team raises the purchase order the
// following week, and until that number is on our invoice the invoice sits in
// somebody's tray. Making them ring up for a one-line change is a slow way to
// be paid for work already done.
//
// Everything here is settings plus the order, no database of its own: the value
// is a column on shp_orders and this file is only the rules about who may move
// it. Shared by the page that offers the box and the route that accepts it, so
// a hand-rolled POST gets exactly the same answer a real click would have.

/** What this shop calls the box, falling back to the wording most shops mean. */
export function customerReferenceLabel(config: Pick<ShpConfig, 'customerReferenceLabel'>): string {
  return config.customerReferenceLabel.trim() || 'Purchase order number'
}

export type ReferenceEditability =
  | { allowed: true }
  | { allowed: false; reason: string }

// Nothing left to put a reference against. A cancelled or refunded order is
// closed paperwork, and a purchase order number arriving after the money has
// gone back is a number pointing at nothing.
const CLOSED_STATUSES = new Set(['CANCELLED', 'REFUNDED'])

export type ReferenceEligibilityInput = {
  config: Pick<ShpConfig, 'customerReferenceFieldEnabled' | 'customerReferenceAfterOrder'>
  order: Pick<ShpOrder, 'status'>
  /** The reference already printed on this order's issued invoice, where one has
   *  been raised. Null or blank where there is no invoice, or where the invoice
   *  went out without a reference on it. */
  invoiceReference?: string | null
}

/**
 * Whether the customer themselves may set the reference on this order now.
 *
 * The one rule worth explaining is the last: an invoice that already carries a
 * reference is left alone. An invoice is a snapshot of what was sent, and this
 * module has never rewritten one - a wrong invoice is voided and reissued, not
 * quietly edited under the person holding it. Where the invoice went out with
 * the box empty there is nothing to contradict, so the number the customer adds
 * is printed on it (see invoiceDocContext); where it went out with a number on
 * it, changing that number is a conversation with the shop rather than a text
 * box.
 */
export function customerCanSetReference(input: ReferenceEligibilityInput): ReferenceEditability {
  if (!input.config.customerReferenceFieldEnabled || !input.config.customerReferenceAfterOrder) {
    return { allowed: false, reason: 'This shop does not take order references through the website. Get in touch and we will add it.' }
  }
  if (CLOSED_STATUSES.has(input.order.status)) {
    return { allowed: false, reason: 'This order has already been cancelled or refunded, so its paperwork is closed.' }
  }
  const onInvoice = input.invoiceReference?.trim()
  if (onInvoice) {
    return { allowed: false, reason: `Your invoice has already gone out with ${onInvoice} on it. Get in touch if that needs changing and we will sort it.` }
  }
  return { allowed: true }
}

/** Whether the box is offered at all on this shop - the question the order page
 *  asks before it draws anything, so a shop that has never heard of purchase
 *  orders is not shown an empty panel about them. */
export function customerReferenceOfferedAfterOrder(
  config: Pick<ShpConfig, 'customerReferenceFieldEnabled' | 'customerReferenceAfterOrder'>,
): boolean {
  return config.customerReferenceFieldEnabled && config.customerReferenceAfterOrder
}

/** As long as a reference is allowed to be. Long enough for the longest purchase
 *  order number anybody's finance system produces, short enough that it still
 *  fits on the invoice's own row. Enforced on the route and matched on the box. */
export const CUSTOMER_REFERENCE_MAX_LENGTH = 120
