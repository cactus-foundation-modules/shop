/**
 * The sentence a shopper sees when their postcode has been carved out of every
 * zone that could have served them. Shared by the checkout session route (which
 * warns early, on the address step) and the payment-intent route (which is where
 * the rule is actually kept), so both say the same thing.
 *
 * The default is deliberately plain and blameless: it is not the shopper's
 * mistake, and a delivery area is a perfectly ordinary thing for a shop to have.
 */
export const DEFAULT_EXCLUDED_POSTCODE_MESSAGE =
  "Sorry, we cannot deliver to that postcode. Do get in touch if you would like us to try."

export function excludedPostcodeMessage(configured: string): string {
  return configured.trim() || DEFAULT_EXCLUDED_POSTCODE_MESSAGE
}
