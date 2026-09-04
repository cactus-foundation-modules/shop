import { formatInSiteTimezone } from '@/lib/config/timezone'
import type { ShpAddress, ShpOrderRequestStatus, ShpOrderRequestType, ShpOrderStatus } from '@/modules/shop/lib/types'
import type { MemberOrderFulfilment } from '@/modules/shop/lib/member-orders'

// How an order reads to the person who placed it, rather than to the person who
// runs the shop. PROCESSING is a workflow state; "Being prepared" is what the
// customer wants to know. Shared by the order list, the order detail and the
// receipt so all three say the same thing.

type Tone = 'default' | 'primary' | 'success' | 'warning' | 'error'

export const ORDER_STATUS_DISPLAY: Record<ShpOrderStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Awaiting payment', tone: 'warning' },
  PROCESSING: { label: 'Being prepared', tone: 'primary' },
  SHIPPED: { label: 'On its way', tone: 'primary' },
  COMPLETED: { label: 'Complete', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'default' },
  REFUNDED: { label: 'Refunded', tone: 'default' },
  PARTIALLY_REFUNDED: { label: 'Partly refunded', tone: 'warning' },
  ON_HOLD: { label: 'On hold', tone: 'warning' },
}

export const FULFILMENT_DISPLAY: Record<MemberOrderFulfilment, { label: string; tone: Tone }> = {
  UNDISPATCHED: { label: 'Not dispatched yet', tone: 'default' },
  PARTIAL: { label: 'Partly dispatched', tone: 'warning' },
  DISPATCHED: { label: 'All dispatched', tone: 'success' },
}

export const REQUEST_STATUS_DISPLAY: Record<ShpOrderRequestStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Waiting on us', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  DECLINED: { label: 'Declined', tone: 'error' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'default' },
}

export const REQUEST_TYPE_LABEL: Record<ShpOrderRequestType, string> = {
  CANCEL: 'Cancellation',
  RETURN: 'Return',
}

export function badgeClass(tone: Tone): string {
  return `badge badge-${tone === 'default' ? 'default' : tone}`
}

/** A postal address on its own lines. Used for delivery and billing on the
 * order detail and the receipt. */
export function addressLines(address: ShpAddress): string[] {
  return [
    [address.firstName, address.lastName].filter(Boolean).join(' '),
    address.company,
    address.line1,
    address.line2,
    address.city,
    address.county,
    address.postcode,
    address.country && address.country !== 'GB' ? address.country : null,
  ].filter((line): line is string => !!line && line.trim().length > 0)
}

/** "3 August 2026" - the format a British shopper reads without thinking. Takes
 *  the site's timezone because these pages are server-rendered and the machine's
 *  own clock is UTC: an order placed at half past midnight in a British summer
 *  was being dated the day before on the customer's own order page. */
export function formatOrderDate(date: Date, timezone: string): string {
  return formatInSiteTimezone(date, timezone, { day: 'numeric', month: 'long', year: 'numeric' })
}

/** "3 Aug" - the same date with the wind taken out of it, for the progress rail,
 *  where four full dates side by side is four times more type than the four
 *  words above them and reads as the important part. The year is dropped on
 *  purpose: it is on the header a few lines up, and a rail is a shape first. */
export function formatOrderDateShort(date: Date, timezone: string): string {
  return formatInSiteTimezone(date, timezone, { day: 'numeric', month: 'short' })
}

/** The organisation an order was placed on behalf of, if one was given.
 *
 * The order's own field first: that is where the checkout puts it now, since it
 * says who the customer is rather than where the parcel goes. The two address
 * fallbacks are for orders placed while it lived in the delivery address, and
 * for modules that still write one there (a converted quote, say). Billing wins
 * over delivery on the same reasoning the invoice uses (see lib/invoices.ts): if
 * someone filled a billing address in at all, that is the party being invoiced,
 * and a delivery company may well be a site office. Empty strings count as "not
 * given" - the field is submitted either way and a blank one is not a company
 * called "".
 *
 * The DELIVERY fallback only applies to an order carrying no billing address of
 * its own. Once it has one, that address is the order's answer to "who is being
 * billed", and a company left on the delivery address is describing a site
 * office or a reception desk. Without that clause a customer clearing the
 * company on their own invoice (see lib/customer-billing.ts) had it handed
 * straight back to them by a delivery label - which on an order whose
 * organisation was backfilled out of that very field, by migration 027, is
 * every one of them. */
export function orderCompanyName(order: {
  customerOrganisation?: string | null
  shippingAddress?: ShpAddress | null
  billingAddress?: ShpAddress | null
}): string | null {
  return order.customerOrganisation?.trim()
    || order.billingAddress?.company?.trim()
    || (order.billingAddress ? null : order.shippingAddress?.company?.trim() || null)
    || null
}

/** Who the order is FROM, for a list that has one line to say it in. A trade
 * shop knows the order as "Acme Ltd", not as whoever in the office happened to
 * type the card number, so the company leads whenever there is one. */
export function orderCustomerLabel(order: {
  customerName: string
  customerOrganisation?: string | null
  shippingAddress?: ShpAddress | null
  billingAddress?: ShpAddress | null
}): string {
  return orderCompanyName(order) ?? order.customerName
}
