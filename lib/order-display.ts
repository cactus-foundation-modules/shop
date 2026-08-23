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

/** "3 August 2026" - the format a British shopper reads without thinking. */
export function formatOrderDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** The company an order was placed on behalf of, if one was given.
 *
 * Billing wins over delivery on the same reasoning the invoice uses (see
 * lib/invoices.ts): if someone filled a billing address in at all, that is the
 * party being invoiced, and the delivery company may well be a site office.
 * Empty strings count as "not given" - the checkout submits the field either
 * way and an unticked "this is a business" leaves it blank, not absent. */
export function orderCompanyName(order: {
  shippingAddress?: ShpAddress | null
  billingAddress?: ShpAddress | null
}): string | null {
  return order.billingAddress?.company?.trim() || order.shippingAddress?.company?.trim() || null
}

/** Who the order is FROM, for a list that has one line to say it in. A trade
 * shop knows the order as "Acme Ltd", not as whoever in the office happened to
 * type the card number, so the company leads whenever there is one. */
export function orderCustomerLabel(order: {
  customerName: string
  shippingAddress?: ShpAddress | null
  billingAddress?: ShpAddress | null
}): string {
  return orderCompanyName(order) ?? order.customerName
}
