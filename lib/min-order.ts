// Minimum order quantity, in one place because four surfaces have to agree on
// it: the buy button, the basket's stepper, the cart validation and the
// checkout. A product (or a variation's hidden child row) may say the fewest it
// sells in one go; everything else is "one", which is what all but every row in
// a catalogue means.
//
// Deliberately dependency-free so the storefront islands can import it without
// dragging the server-only data layer into the browser bundle.

/**
 * The stored figure, read as a usable minimum. Null, zero, negatives, fractions
 * and anything non-finite all come back as 1 - a minimum of "one" is no minimum
 * at all, and a stored 0 must never be able to talk a stepper down to nothing.
 */
export function minOrderQuantity(stored: number | null | undefined): number {
  if (stored == null || !Number.isFinite(stored)) return 1
  const floored = Math.floor(stored)
  return floored > 1 ? floored : 1
}

/**
 * A variation's minimum, falling back to the product it belongs to. A blank on
 * the child is not "no minimum", it is "whatever the product says" - which is
 * what lets an owner set one figure on the parent instead of stamping it across
 * three hundred combinations.
 */
export function resolveMinOrderQuantity(
  childStored: number | null | undefined,
  parentStored: number | null | undefined,
): number {
  return childStored != null ? minOrderQuantity(childStored) : minOrderQuantity(parentStored)
}

/** Round a quantity up to the minimum. Anything at or above it is left alone. */
export function applyMinOrderQuantity(quantity: number, min: number): number {
  return quantity < min ? min : quantity
}

/**
 * How to say it to a shopper on the product page. One sentence, no jargon, and
 * the unit word agrees with the number so "sold in 1s" can never appear.
 *
 * `pooled` is true where the minimum counts across everything the shopper picks
 * from one listing - four chairs in four different colours are still four
 * chairs - which has to be said, or a shopper wanting a mix reads the stepper's
 * opening figure as "four of THIS one".
 */
export function minOrderSentence(min: number, pooled = false): string {
  return pooled
    ? `Sold in ${min}s - order at least ${min} in total, in any mix of options.`
    : `Sold in ${min}s - the smallest order for this is ${min}.`
}

/**
 * Why a basket is being held back: what the minimum is, and how many more are
 * needed to reach it. Both halves matter - "minimum order 4" alone leaves a
 * shopper counting their own basket to work out what to do about it.
 */
export function minOrderShortfallReason(min: number, shortfall: number, pooled = false): string {
  const more = `add ${shortfall} more`
  return pooled
    ? `Sold in ${min}s - ${more} from this product, in any mix of options`
    : `Sold in ${min}s - ${more}`
}

/** The same thing at basket length, where there is room for one line only. */
export function minOrderShortNote(min: number): string {
  return `Minimum order ${min}`
}
