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
