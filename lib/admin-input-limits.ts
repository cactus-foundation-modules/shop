// Ceilings for the lists and the long text boxes the admin screens write - how
// many products one bulk action touches, how many lines a shipping zone lists,
// how long an order note or a one-off email may be.
//
// Like the address ceilings next door (lib/address-limits.ts) they are
// ceilings, not rules. Each sits well above anything the screen that sends it
// can produce in ordinary use - the products list selects one page of twenty,
// the recommendation pickers add one product at a time - so the only thing they
// turn away is a hand-rolled request, a script gone wrong, or a paste of
// something that was never meant to go in the box. An oversize request gets a
// 400 that says which ceiling it hit, never a quiet trim: a list that was cut
// short without saying so looks exactly like one that saved.
//
// Plain constants and nothing else, so a client screen can import them without
// dragging anything server-side into the browser.

/** Products one bulk delete or status change on the products list may touch.
 *  The list selects a page at a time (twenty rows), and a selection is dropped
 *  whenever the page changes, so the screen never gets near it. Matches the
 *  orders list's bulk status change. */
export const BULK_PRODUCT_MAX_IDS = 200

/** Length of one internal note on an order. Room for a pasted email thread;
 *  not room for a pasted database. */
export const ORDER_NOTE_MAX_LENGTH = 20_000

/** Subject line of a one-off email to a customer. */
export const MANUAL_EMAIL_SUBJECT_MAX_LENGTH = 250

/** Body of a one-off email to a customer, as the HTML the email box turns the
 *  typed message into. Escaping and paragraph tags make that longer than what
 *  was typed, hence the headroom. */
export const MANUAL_EMAIL_BODY_MAX_LENGTH = 100_000

/** Lines in one of a shipping zone's two postcode lists. A list of every UK
 *  postcode district is around three thousand lines and every sector around
 *  eleven thousand, and a prefix or a range covers far more than either in one
 *  line - so this only ever stops a list of individual full postcodes. */
export const SHIPPING_ZONE_MAX_POSTCODES = 20_000

/** Length of one line in a postcode list. The longest real postcode anywhere
 *  is around ten characters, and a range ("AB30-AB32") is nine. */
export const SHIPPING_ZONE_POSTCODE_LINE_MAX_LENGTH = 32

/** Products one collection membership write may name - which for a reorder or
 *  a removal is the WHOLE collection, since those send every product back in
 *  its new order. Set for a collection far bigger than any catalogue the
 *  collection screen could draw. */
export const COLLECTION_MAX_PRODUCT_IDS = 10_000

/** Hand-picked related products or upsells on one product. Only a few are ever
 *  shown at a time; the rest are spares for when one goes out of stock. */
export const RECOMMENDATION_MAX_PICKS = 200

/** Products kept out of one product's automatic suggestions. */
export const RECOMMENDATION_MAX_EXCLUSIONS = 1_000

/** Categories, tags or collections reordered in one go. The tag and collection
 *  screens send every row in the list, and the category tree one parent's
 *  children. */
export const CATALOGUE_REORDER_MAX_IDS = 5_000

/** Photographs and videos on one product, as the product editor saves them. */
export const PRODUCT_MAX_MEDIA = 500

/** Categories, tags or collections one product is filed under, each. The
 *  editor ticks them one at a time. */
export const PRODUCT_MAX_TAXONOMY_IDS = 1_000

/** A ceiling written the way a person reads it - 20,000 rather than 20000 -
 *  for the messages that name one. */
export function formatLimit(n: number): string {
  return n.toLocaleString('en-GB')
}
