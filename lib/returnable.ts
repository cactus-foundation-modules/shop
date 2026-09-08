// Whether a line may be sent back, in one place because four surfaces have to
// agree on it: the checkout that snapshots the answer onto the order, the order
// page that offers (or does not offer) the button, the endpoint that accepts the
// request, and the admin queue that shows what was asked.
//
// Deliberately dependency-free, exactly as lib/min-order.ts is, so a storefront
// island can import it without dragging the server-only data layer into the
// browser bundle.

/**
 * The stored flag, read as an answer. NULL means "nothing said here", which is
 * not "no" - a catalogue that has never touched the setting is fully returnable,
 * which is the behaviour every shop had before the column existed.
 */
export function isReturnable(stored: boolean | null | undefined): boolean {
  return stored !== false
}

/**
 * A variation's answer, falling back to the listing it belongs to. A blank on
 * the child is "whatever the product says", which is what lets an owner mark one
 * bespoke listing instead of stamping it across three hundred combinations - the
 * same fallback resolveMinOrderQuantity does, and for the same reason.
 *
 * A child that DOES carry a flag wins outright, in both directions: a
 * made-to-order finish on an otherwise stock listing can be marked on its own,
 * and so can the one stock finish on a bespoke range.
 */
export function resolveReturnable(
  childStored: boolean | null | undefined,
  parentStored: boolean | null | undefined,
): boolean {
  return childStored != null ? childStored : isReturnable(parentStored)
}

/**
 * What to tell a customer when a line cannot go back and the owner has written
 * nothing of their own.
 *
 * Says "this item" rather than naming the reason, because the module cannot know
 * it: bespoke, hygiene, perishable and licensed are four different reasons with
 * four different sentences, and guessing wrong reads worse than not guessing.
 * The owner's own wording (non_returnable_note) replaces this wherever it is set.
 */
export const NON_RETURNABLE_DEFAULT_NOTE = 'This item cannot be sent back once ordered.'

/** The owner's wording where they gave one, the stock sentence where they did not. */
export function nonReturnableNote(stored: string | null | undefined): string {
  const trimmed = stored?.trim()
  return trimmed ? trimmed : NON_RETURNABLE_DEFAULT_NOTE
}

/**
 * The whole-order version, for the panel that offers the button. Said once at
 * the top rather than per line, because a shop selling nothing returnable would
 * otherwise print the same sentence twenty times.
 */
export const NOTHING_RETURNABLE_REASON =
  'Nothing on this order can be sent back through the website. Get in touch if you think something is wrong with it.'

/**
 * The three answers a shop can give about sending something back. Two of them
 * are the flag above; the third is the one every trade counter actually gives.
 *
 *   ALLOWED        the usual policy applies and the customer may expect a yes
 *   DISCRETIONARY  they may ask, and we may say no - and it may cost them the
 *                  collection either way
 *   NONE           it does not come back, and (since it cannot) it cannot be
 *                  called off once the order is placed either
 *
 * Two stored columns rather than one three-valued one, because `returnable` is
 * a public CSV column, a variations column, a checkout snapshot and a pill on
 * the product page - see migrations/045_returns_discretion.sql. Read in the
 * order below, always: a refusal outranks a discretion, because "we might take
 * this back" said over "we never take this back" is a promise the shop cannot
 * keep.
 */
export type ReturnsPolicy = 'ALLOWED' | 'DISCRETIONARY' | 'NONE'

/** The stored pair, read as one answer. */
export function returnsPolicy(
  storedReturnable: boolean | null | undefined,
  storedDiscretionary: boolean | null | undefined,
): ReturnsPolicy {
  if (!isReturnable(storedReturnable)) return 'NONE'
  return storedDiscretionary === true ? 'DISCRETIONARY' : 'ALLOWED'
}

/**
 * A variation's discretion, falling back to the listing it belongs to - the
 * same child-then-parent fallback resolveReturnable does, and for the same
 * reason: the owner marks the LISTING and expects every combination of it to
 * follow, and a child that carries its own answer wins in both directions.
 */
export function resolveDiscretionary(
  childStored: boolean | null | undefined,
  parentStored: boolean | null | undefined,
): boolean {
  return childStored != null ? childStored : parentStored === true
}

/**
 * What to tell a customer about a discretionary line when the owner has written
 * nothing of their own.
 *
 * Says both halves on purpose. "We might" without "it might cost you" is how a
 * collection charge turns into a complaint, and the charge is the part a
 * shopper has never been told anywhere else on the site.
 */
export const DISCRETIONARY_DEFAULT_NOTE =
  'We may be able to take this back - ask us and we will let you know. There may be a charge for collecting it.'

/** The owner's wording where they gave one, the stock sentence where they did not. */
export function discretionaryNote(stored: string | null | undefined): string {
  const trimmed = stored?.trim()
  return trimmed ? trimmed : DISCRETIONARY_DEFAULT_NOTE
}

/**
 * The sentence for a line, whichever of the two answers it is - and null on a
 * line that simply comes back, where there is nothing to say. One column holds
 * the owner's wording for both, because a product has one returns story and
 * asking an owner to write it twice is how one of the two ends up blank.
 */
export function returnsPolicyNote(
  policy: ReturnsPolicy,
  stored: string | null | undefined,
): string | null {
  if (policy === 'NONE') return nonReturnableNote(stored)
  if (policy === 'DISCRETIONARY') return discretionaryNote(stored)
  return null
}

/** How the answer is put to staff, on the product page and in the admin. */
export const RETURNS_POLICY_LABEL: Record<ReturnsPolicy, string> = {
  ALLOWED: 'Returns: accepted',
  DISCRETIONARY: 'Returns: at our discretion',
  NONE: 'Returns: not accepted',
}

/**
 * Why an order cannot be called off, when something on it is not the sort of
 * thing that comes back.
 *
 * A cancellation and a return are the same question asked at two different
 * moments: can we get out of this? Goods a shop will not take back once they
 * have arrived are, almost always, goods it has already committed to the moment
 * the order was placed - cut, upholstered, or ordered in specially - so the
 * answer does not change just because the van has not been yet.
 *
 * Names the lines rather than refusing in the abstract: an order of six things
 * where one is bespoke needs to say WHICH one, or the customer's next move is
 * an email asking exactly that.
 */
export function nonCancellableReason(productNames: string[]): string {
  const list = productNames.length > 0 ? ` - ${productNames.join(', ')}` : ''
  return `Part of this order cannot be called off once it has been placed${list}. Get in touch and we will see what can be done.`
}
