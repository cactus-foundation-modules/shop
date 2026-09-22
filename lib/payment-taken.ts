import type { ShpPaymentStatus } from '@/modules/shop/lib/types'

// Which payment states mean the customer's money reached the shop.
//
// payment_status used to stop at PAID. A refund moved the order's lifecycle
// status and left this column reading "Paid" for ever, so the payment badge and
// the payment filters on the orders list disagreed with the refund sitting right
// underneath them. It now follows the money - PAID, then PARTIALLY_REFUNDED or
// REFUNDED as refunds are recorded - which is what the column's own CHECK
// constraint always allowed for.
//
// So anything that used to test for PAID to mean "the customer paid for this"
// tests for this set instead: a refund changes what the badge says without also
// taking the sale out of the takings, the tax report, the customer's history or
// the idempotency guards that stop a replayed webhook paying an order twice.
// Refunds are netted off wherever a figure needs them netted (the tax report,
// credit notes), exactly as they were before.
export const PAYMENT_TAKEN_STATUSES = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const satisfies readonly ShpPaymentStatus[]

/** The customer paid for this order - whatever has been refunded since. */
export function paymentTaken(status: string): boolean {
  return (PAYMENT_TAKEN_STATUSES as readonly string[]).includes(status)
}

/** Paid, and at least some of the money is still with the shop - an order that
 *  still has goods owed against it, and whose money a cancellation would keep. */
export function paymentHeld(status: string): boolean {
  return status === 'PAID' || status === 'PARTIALLY_REFUNDED'
}
