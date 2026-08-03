// Shared wording and badge colours for orders, used by both the list and the
// single order screen. One copy so a status cannot read "Dispatched" on one
// screen and "SHIPPED" on the other - which is exactly what it used to do.

export type Badge = { cls: string; label: string }

export const ORDER_STATUS_BADGE: Record<string, Badge> = {
  PENDING: { cls: 'badge-default', label: 'Pending' },
  PROCESSING: { cls: 'badge-info', label: 'Processing' },
  SHIPPED: { cls: 'badge-primary', label: 'Dispatched' },
  COMPLETED: { cls: 'badge-success', label: 'Completed' },
  CANCELLED: { cls: 'badge-default', label: 'Cancelled' },
  REFUNDED: { cls: 'badge-warning', label: 'Refunded' },
  PARTIALLY_REFUNDED: { cls: 'badge-warning', label: 'Part refunded' },
  ON_HOLD: { cls: 'badge-warning', label: 'On hold' },
}

export const PAYMENT_STATUS_BADGE: Record<string, Badge> = {
  PENDING: { cls: 'badge-warning', label: 'Unpaid' },
  PAID: { cls: 'badge-success', label: 'Paid' },
  PARTIALLY_REFUNDED: { cls: 'badge-warning', label: 'Part refunded' },
  REFUNDED: { cls: 'badge-default', label: 'Refunded' },
  FAILED: { cls: 'badge-error', label: 'Payment failed' },
  AWAITING_CONFIRMATION: { cls: 'badge-info', label: 'Awaiting confirmation' },
}

// Statuses an owner sets by hand. REFUNDED and PARTIALLY_REFUNDED are left out
// on purpose: they are what a refund does to an order, not something to pick
// from a menu, and setting them by hand would say money went back when none did.
export const SETTABLE_STATUSES = ['PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'ON_HOLD', 'CANCELLED'] as const

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  STRIPE: 'Card',
  PAYPAL: 'PayPal',
  BANK_TRANSFER: 'Bank transfer',
  CASH: 'Cash',
}

// Modules can contribute their own payment methods (the shop.payment-providers
// point), so an unknown code is tidied up rather than printed raw.
export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABEL[method] ?? method.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())
}

export function badgeFor(map: Record<string, Badge>, key: string): Badge {
  return map[key] ?? { cls: 'badge-default', label: key.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) }
}

// Dispatch progress as a badge. Worked out from what has actually left the
// building, never stored, so it cannot drift out of step with the parcels.
// "Nothing to send" covers an order that is entirely refunded or entirely
// digital - saying "Not dispatched" there would be a job that never comes.
export function fulfilmentBadge(m: { dispatchedUnits: number; outstandingUnits: number } | undefined): Badge {
  if (!m) return { cls: 'badge-default', label: '—' }
  if (m.outstandingUnits === 0 && m.dispatchedUnits === 0) return { cls: 'badge-default', label: 'Nothing to send' }
  if (m.outstandingUnits === 0) return { cls: 'badge-success', label: 'All dispatched' }
  if (m.dispatchedUnits > 0) return { cls: 'badge-warning', label: 'Partly dispatched' }
  return { cls: 'badge-default', label: 'Not dispatched' }
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', DATE_FORMAT)
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('en-GB', DATE_FORMAT)}, ${d.toLocaleTimeString('en-GB', TIME_FORMAT)}`
}

// "20 minutes ago" for anything recent, a plain date once that stops being the
// useful reading. Anything in the future (a back-dated parcel typed as next
// week, say) reads as the date rather than "in -3 days".
export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const seconds = Math.round((Date.now() - d.getTime()) / 1000)
  if (seconds < 0) return formatDate(d)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days <= 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatDate(d)
}
