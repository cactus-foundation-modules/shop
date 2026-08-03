import type {
  ShpOrder,
  ShpOrderItemDispatch,
  ShpOrderRequestType,
  ShpOrderRequestWithItems,
} from '@/modules/shop/lib/types'

// Whether a customer may ask, and what they may ask for. Pure rules, no
// database: the member page uses them to decide what to offer, and the API uses
// the same functions to decide whether to accept. One copy, so the button and
// the endpoint can never disagree - a "Cancel this order" button that 400s is
// worse than no button.

export const SHP_CANCEL_REASONS = [
  { code: 'CHANGED_MIND', label: 'I have changed my mind' },
  { code: 'ORDERED_WRONG', label: 'I ordered the wrong thing' },
  { code: 'FOUND_ELSEWHERE', label: 'I found it elsewhere' },
  { code: 'TOO_SLOW', label: 'It is taking longer than I can wait' },
  { code: 'OTHER', label: 'Something else' },
] as const

export const SHP_RETURN_REASONS = [
  { code: 'FAULTY', label: 'It arrived damaged or faulty' },
  { code: 'WRONG_ITEM', label: 'The wrong item arrived' },
  { code: 'NOT_AS_DESCRIBED', label: 'It is not as described' },
  { code: 'NO_LONGER_NEEDED', label: 'I no longer need it' },
  { code: 'OTHER', label: 'Something else' },
] as const

export function reasonsFor(type: ShpOrderRequestType): ReadonlyArray<{ code: string; label: string }> {
  return type === 'CANCEL' ? SHP_CANCEL_REASONS : SHP_RETURN_REASONS
}

export function isValidReason(type: ShpOrderRequestType, code: string): boolean {
  return reasonsFor(type).some((r) => r.code === code)
}

export function reasonLabel(type: ShpOrderRequestType, code: string): string {
  return reasonsFor(type).find((r) => r.code === code)?.label ?? code
}

// Statuses where there is nothing left to call off or send back. CANCELLED and
// REFUNDED are already done; PENDING is an order whose payment never landed, so
// there is nothing to cancel that abandonment will not clear up by itself.
const CLOSED_STATUSES = new Set(['CANCELLED', 'REFUNDED'])

export type RequestEligibility =
  | { allowed: true }
  | { allowed: false; reason: string }

export type EligibilityInput = {
  order: Pick<ShpOrder, 'status' | 'paymentStatus'>
  dispatch: Pick<ShpOrderItemDispatch, 'outstandingQty' | 'dispatchedQty'>[]
  /** The most recent parcel's ship date, or null if nothing has gone out. */
  lastShippedAt: Date | null
  config: { cancelRequestsEnabled: boolean; returnRequestsEnabled: boolean; returnWindowDays: number }
  /** Any request already open on this order. */
  openRequest?: ShpOrderRequestWithItems | null
  now?: Date
}

/** Cancelling is for an order that has not started moving. The moment any part
 * of it is in a van, calling the whole thing off is not a cancellation any more
 * - it is a return, and it goes through the return flow so the goods come back
 * before the money does. */
export function canRequestCancel(input: EligibilityInput): RequestEligibility {
  if (!input.config.cancelRequestsEnabled) {
    return { allowed: false, reason: 'This shop handles cancellations by email. Get in touch and we will sort it.' }
  }
  if (input.openRequest) {
    return { allowed: false, reason: 'You already have a request open on this order. We will come back to you on it.' }
  }
  if (CLOSED_STATUSES.has(input.order.status)) {
    return { allowed: false, reason: 'This order has already been cancelled or refunded.' }
  }
  if (input.dispatch.some((line) => line.dispatchedQty > 0)) {
    return { allowed: false, reason: 'Part of this order has already been dispatched, so it is a return rather than a cancellation.' }
  }
  return { allowed: true }
}

/** Returns are for goods that have actually arrived - so at least one unit has
 * to have been dispatched, and the window is counted from the last parcel out
 * rather than from the order date. An order that took three weeks to dispatch
 * must not eat the customer's return window while it sat on a shelf. */
export function canRequestReturn(input: EligibilityInput): RequestEligibility {
  if (!input.config.returnRequestsEnabled) {
    return { allowed: false, reason: 'This shop handles returns by email. Get in touch and we will sort it.' }
  }
  if (input.openRequest) {
    return { allowed: false, reason: 'You already have a request open on this order. We will come back to you on it.' }
  }
  if (CLOSED_STATUSES.has(input.order.status)) {
    return { allowed: false, reason: 'This order has already been cancelled or refunded.' }
  }
  if (!input.dispatch.some((line) => line.dispatchedQty > 0)) {
    return { allowed: false, reason: 'Nothing from this order has been dispatched yet, so there is nothing to send back.' }
  }
  if (input.config.returnWindowDays === 0) {
    return { allowed: false, reason: 'This shop does not take returns through the website. Get in touch and we will help.' }
  }
  if (input.lastShippedAt) {
    const deadline = returnDeadline(input.lastShippedAt, input.config.returnWindowDays)
    if ((input.now ?? new Date()) > deadline) {
      return {
        allowed: false,
        reason: `The ${input.config.returnWindowDays}-day return window for this order closed on ${deadline.toLocaleDateString('en-GB')}. Get in touch if you think something is wrong with it.`,
      }
    }
  }
  return { allowed: true }
}

export function returnDeadline(lastShippedAt: Date, windowDays: number): Date {
  const deadline = new Date(lastShippedAt)
  deadline.setDate(deadline.getDate() + windowDays)
  // End of that day, not the same clock time: a customer told they have until
  // the 30th should have until the end of the 30th.
  deadline.setHours(23, 59, 59, 999)
  return deadline
}

/** How many units of each line may still be sent back: what arrived, less what
 * has already been refunded, less anything already covered by an open request. */
export function returnableQty(
  line: Pick<ShpOrderItemDispatch, 'orderItemId' | 'dispatchedQty'>,
  refundedQty: number,
  alreadyRequested = 0,
): number {
  return Math.max(line.dispatchedQty - refundedQty - alreadyRequested, 0)
}
