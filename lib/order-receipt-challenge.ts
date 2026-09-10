// PROTECTED - what a device that did not place the order has to prove.
//
// The confirmation link the checkout hands out carries a signed token over the
// order number (see lib/order-receipt-token.ts), and for a while that token was
// the whole lock: anybody holding the address saw the customer's name, their
// full delivery address and what they had spent. A receipt link is pasted into
// a WhatsApp group, forwarded to a colleague, left in a shared browser's
// history and typed into a URL bar that syncs across a household - so a link
// that opens for anybody who has it is a link that opens for rather more people
// than the person who bought the desk.
//
// So the token now only says WHICH order is being asked about. Being allowed to
// see it is the same rule the guest order page has always used - the browser
// that checked out was granted access at the till (lib/guest-order-access.ts),
// or a signed-in owner is looking at their own order. Any other device answers
// this challenge first, exactly as somebody arriving from a tracking link does.
//
// The answer is the delivery postcode, which is what the customer knows and the
// person holding a forwarded link does not. Except on an order that has no
// postcode: this module ships to shops delivering to countries that do not use
// them, and there a blank box must never be the key - so those orders ask for
// the email address the confirmation went to instead. Same strength as the
// order-number-plus-email lookup that has always existed beside this, and the
// alternative is a customer who simply cannot reach their own receipt.
import { normalisePostcode, postcodeMatches } from '@/modules/shop/lib/order-lookup'
import type { ShpOrder } from '@/modules/shop/lib/types'

export type ReceiptChallenge = 'postcode' | 'email'

/** Everything the challenge needs off an order, so a caller holding only part
 *  of one - or a test holding neither - can still ask. */
export type ReceiptChallengeOrder = Pick<ShpOrder, 'customerEmail' | 'shippingAddress'>

/** Which question this order can be opened with. */
export function receiptChallengeFor(order: ReceiptChallengeOrder): ReceiptChallenge {
  return normalisePostcode(order.shippingAddress?.postcode).length > 0 ? 'postcode' : 'email'
}

/** Whether a typed email address is this order's. Exported because it is also
 *  the whole of the OLD way into an order - order number plus the address it was
 *  placed with - which the receipt-access route still accepts from somebody
 *  holding no link at all.
 *
 *  An email address reduced to what two people typing the same address agree
 *  on. Case only - the local part of an address is case-sensitive by the letter
 *  of the standard and by nobody's practice, while trimming and lower-casing is
 *  what every mail client in the world does before it sends. Deliberately does
 *  NOT strip dots or `+tags`: those genuinely are different addresses at some
 *  providers, and this is a lock, not a de-duplicator. */
export function receiptEmailMatches(typed: string | null | undefined, actual: string | null | undefined): boolean {
  const a = (typed ?? '').trim().toLowerCase()
  return a.length > 0 && a === (actual ?? '').trim().toLowerCase()
}

/**
 * Whether what was typed opens this order.
 *
 * One function rather than a branch at the call site, so the route, the form
 * and the tests cannot end up disagreeing about which question was asked. An
 * empty answer never matches anything, whichever question it was.
 */
export function receiptAnswerMatches(order: ReceiptChallengeOrder, answer: string | null | undefined): boolean {
  return receiptChallengeFor(order) === 'postcode'
    ? postcodeMatches(answer, order.shippingAddress?.postcode)
    : receiptEmailMatches(answer, order.customerEmail)
}
