import type { ShpConfig } from '@/modules/shop/lib/config'
import type { ShpOrder } from '@/modules/shop/lib/types'

// Where to send the money, for a method nobody has been paid on yet.
//
// One answer, in one place, because four surfaces print it and they must not
// disagree: the thank-you page, the shopper's own order page, the "we have your
// order, here is how to pay" email, and now the proforma. Three of those four
// had their own copy of the map below, which is exactly the arrangement that
// ends with a shop editing its bank details and one of them still saying the old
// account number.
//
// Named method by method rather than read off the provider registry's
// confirmMode, deliberately. A manual method contributed by a module keeps its
// instructions in its OWN settings, not in shop's, and matching on "manual"
// alone would print the cash wording underneath somebody else's method. A module
// method simply has no entry here, which is the honest answer: shop does not
// know where that money goes.
export const MANUAL_INSTRUCTION_KEYS = {
  BANK_TRANSFER: 'bankTransferInstructions',
  CASH: 'cashInstructions',
} as const

/** The words this order's method tells the payer, or '' where shop holds none.
 *  Says nothing about whether they should still be shown - see
 *  `paymentOutstanding` below for that. */
export function manualPaymentInstructions(
  paymentMethod: string,
  config: Pick<ShpConfig, 'bankTransferInstructions' | 'cashInstructions'>,
): string {
  const key = MANUAL_INSTRUCTION_KEYS[paymentMethod as keyof typeof MANUAL_INSTRUCTION_KEYS]
  return key ? (config[key] ?? '').trim() : ''
}

/** Whether this order still has money owing on it - as against settled or
 *  written off. A cancelled or refunded order asking to be paid would be worse
 *  than saying nothing at all, and both sit at PENDING for ever on a manual
 *  method, because nobody ever paid them. */
export function paymentOutstanding(order: Pick<ShpOrder, 'status' | 'paymentStatus'>): boolean {
  return (
    (order.paymentStatus === 'PENDING' || order.paymentStatus === 'AWAITING_CONFIRMATION') &&
    order.status !== 'CANCELLED' &&
    order.status !== 'REFUNDED'
  )
}
