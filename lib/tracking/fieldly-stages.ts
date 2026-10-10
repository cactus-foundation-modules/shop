// What a Fieldly stage means before the shop's owner has said anything.
//
// Fieldly's stage words are the courier's own ("Picked", "Loaded", "Booked"),
// so most of their meaning is the owner's setting, as with Multidrop. The one
// word the feed backs with a status code of its own is "Delivered" - captured
// 10 October 2026 on a delivered Jewell Enterprises parcel - so that one needs
// no setting. Nothing else is guessed at: a status this shop has not seen is
// progress until somebody lists it.
//
// Its own file with no imports, so the stage-meaning helpers can use it
// without pulling the reader (and zod) along.

export const FIELDLY_STAGE_MEANING: Readonly<Record<string, 'out-for-delivery' | 'delivered' | 'failed'>> = {
  delivered: 'delivered',
}
