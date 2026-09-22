import type { ShpProduct } from '@/modules/shop/lib/types'

/**
 * The sentence a shopper sees when their postcode has been carved out of every
 * zone that could have served them, or when the shop's zones do not reach it at
 * all (see refusesDelivery below). Shared by the checkout session route (which
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

/**
 * Whether the checkout turns this delivery address away, given where the
 * postcode landed (see decideShippingZone) and what is in the basket. Both
 * checkout routes ask this, and both then say excludedPostcodeMessage.
 *
 * An EXCLUDED postcode is refused outright, as it always has been - the owner
 * named it.
 *
 * An UNCOVERED one - the shop has zones, none reaches this postcode, none is a
 * catch-all - is refused only when something in the basket has to be carried
 * there. It used to be let through, and an order from off the edge of the map
 * then went through with no delivery option, nothing charged to carry it, and
 * no zone to take a tax rate from either: the shop quietly posted the goods for
 * free and under-collected the VAT. A basket of downloads and services has no
 * parcel, so it is off nobody's map and goes through as before. A shop with no
 * zones at all is never uncovered, so a new install carries on untouched.
 */
export function refusesDelivery(
  resolution: { excluded: boolean; uncovered: boolean },
  lines: ReadonlyArray<{ product: Pick<ShpProduct, 'type'> }>,
): boolean {
  if (resolution.excluded) return true
  return resolution.uncovered && lines.some((line) => line.product.type === 'PHYSICAL')
}
