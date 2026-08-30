// What the refund modal tells the owner will happen to the money.
//
// This used to be a hardcoded map keyed by payment method with two entries in
// it, and everything not in that map fell through to a single line reading
// "This will be refunded automatically via {STRIPE ? 'Stripe' : 'PayPal'}". So
// the moment a module contributed a third method, the owner was told the money
// was going back through PayPal - wrong company, and, for a method whose
// refunds are manual, a promise of automatic money movement that nothing was
// going to keep. It misfired for GOCARDLESS_IBP and SQUARE too: both DO refund
// automatically, and both were credited to PayPal for it.
//
// So the sentence is driven off the provider's own `refundMode` instead, which
// is the field that actually answers the question. A module that declares
// 'manual' gets the manual wording without shop having to be told its name, and
// the next payment module does not inherit the trap.
//
// The per-method wording below stays exactly as it was: bank transfer and cash
// have had their own sentences for a while, and "the cash itself is yours to
// hand back" is better than anything a general rule would produce. The map is
// now an override on top of a correct default rather than the whole answer.
//
// Pure strings, no imports: the refund modal is a client component and the
// registry that knows about providers is not.

/** The provider facts the sentence is chosen from. Null where the method has no
 *  provider registered at all - an order taken with a module that has since been
 *  removed - in which case nothing is promised in either direction. */
export type ShpRefundNoticeSource = {
  mode: 'provider' | 'manual'
  // The provider's own fixed name (Stripe, PayPal, Square), not the owner's
  // renaming of it. "Refunded automatically via Card" reads as a mistake.
  label: string
} | null

const MANUAL_METHOD_COPY: Record<string, string> = {
  BANK_TRANSFER:
    'This is a bank transfer order. Recording it here takes the items off the order, credits your books and sends the customer a credit note - but the money itself is yours to send. Nothing leaves your bank account by pressing this.',
  CASH:
    'This is a cash order. Recording it here takes the items off the order, credits your books and sends the customer a credit note - but the cash itself is yours to hand back.',
}

export function refundNoticeText(paymentMethod: string, source: ShpRefundNoticeSource): string {
  const named = MANUAL_METHOD_COPY[paymentMethod]
  if (named) return named

  if (source?.mode === 'manual') {
    return `${source.label} does not send refunds back on its own. Recording it here takes the items off the order, credits your books and sends the customer a credit note - but the money itself is yours to send.`
  }
  if (source?.mode === 'provider') {
    return `This will be refunded automatically via ${source.label}.`
  }

  // No provider registered for this method - the module that contributed it has
  // been removed, or the order predates it. Nothing is promised in either
  // direction, because either promise could be the wrong one.
  return 'Recording this takes the items off the order, credits your books and sends the customer a credit note. Check with whoever took the payment whether the money goes back on its own.'
}
