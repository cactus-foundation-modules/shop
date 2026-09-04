// Turning what somebody types into a box into an order we can go and find.
//
// Both halves of the guest order lookup are here, and both exist because the
// person typing is standing in their hallway with a parcel note in one hand,
// not filling in a form they wrote themselves. They will type their postcode
// the way they say it and their order number the way they remember it, and a
// lookup that only accepts the canonical form of either is a lookup that tells
// a real customer their own order does not exist.
//
// Pure and dependency-free on purpose, so the rules can be tested without a
// database and so the page, the route and the tests all ask the same functions.

/**
 * A postcode reduced to the only part of it that carries meaning: the letters
 * and the digits, upper-cased.
 *
 * 'E1 1AA', 'e1 1aa', 'E11AA' and 'E1-1AA' are one postcode written four ways,
 * and the Royal Mail's own space is presentational - it is not in the data, it
 * is put back when the address is printed. Strip everything that is not a
 * letter or a digit and the four collapse into 'E11AA', while 'B29 7QB' stays
 * resolutely 'B297QB' and does not match anything it should not.
 *
 * Deliberately not a UK-shaped validator. This module ships to shops that
 * deliver anywhere, and a regex that knows what a British postcode looks like
 * would reject an Irish Eircode, a Dutch '1012 AB' and a five-digit German one
 * on their way in. Comparing two normalised strings is right everywhere.
 */
export function normalisePostcode(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

/**
 * Whether what was typed is the postcode this order goes to.
 *
 * An empty typed value never matches, even against an order whose delivery
 * postcode is itself empty - which is possible on a shop selling to a country
 * that does not use them. An order with no postcode simply cannot be opened
 * this way, and that is the safe way round: the alternative is a blank box
 * being the key to it.
 */
export function postcodeMatches(typed: string | null | undefined, actual: string | null | undefined): boolean {
  const a = normalisePostcode(typed)
  return a.length > 0 && a === normalisePostcode(actual)
}

/** Order numbers are `<prefix><six digits>` - see lib/order-number.ts. */
const SEQUENCE_DIGITS = 6

/**
 * Every order number the typed text could reasonably mean, most literal first.
 *
 * An order is numbered 'DW000172', and that is what is printed on the email -
 * but a customer reading it back to themselves says "order one seven two", and
 * that is what they type. So all of 'DW000172', 'dw000172', '000172', '172'
 * and 'DW 172' have to arrive at the same order, while '172' on a shop whose
 * prefix is 'OSR' must arrive at 'OSR000172' rather than at somebody else's.
 *
 * Returns candidates rather than one answer because the shop owner picks the
 * prefix and may pick anything, including nothing: on a shop numbering its
 * orders '2026-000172' the padding rules below are guesswork, so the text as
 * typed is always offered as a candidate too and the database has the final
 * say. The caller looks all of them up at once and refuses to guess if more
 * than one is real - see lib/db/orders.ts findOrdersByNumberCandidates.
 */
export function orderNumberCandidates(raw: string | null | undefined, prefix: string): string[] {
  const typed = (raw ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (!typed) return []

  const candidates = new Set<string>([typed])

  // The prefix normalised the same way, so a shop whose prefix carries a dash
  // ('DW-') is matched against text the customer typed without one.
  const head = prefix.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  const body = head && typed.startsWith(head) ? typed.slice(head.length) : typed

  if (body && /^[0-9]+$/.test(body)) {
    // Zero-padded to the width the sequence is generated at, which is what
    // turns '172' into 'DW000172'. Only when it fits: a shop that has sold more
    // than a million things has numbers wider than the padding, and padStart
    // leaves those alone anyway.
    candidates.add(`${head}${body.padStart(SEQUENCE_DIGITS, '0')}`)
    // And unpadded, for a shop whose own numbering never padded in the first
    // place - a module or an import can have written anything into the column.
    candidates.add(`${head}${body}`)
  }

  return [...candidates]
}
