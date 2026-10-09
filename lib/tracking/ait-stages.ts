// The words an AIT parcel's stage is written in, and what each one means.
//
// Every other courier's stages are the courier's own wording, so what they mean
// is the owner's setting. AIT's are not: the reader turns AIT's status CODE into
// these words itself (see ait.ts), so the shop already knows exactly what each
// one means and an owner should not have to type it in for the customer's page
// to tell the truth. With the lists left empty, a van running past the end of
// its window would otherwise read as "progress", and the window passing would
// be taken as arrival.
//
// The owner's lists still win where they name a stage - this is the floor, not
// a ceiling. Its own file with no imports, so the stage-meaning helpers can use
// it without pulling the reader (and zod) along.

export const AIT_STAGE = {
  ordered: 'Order received',
  booked: 'Booked',
  outForDelivery: 'Out for delivery',
  delivered: 'Delivered',
  unsuccessful: 'Unsuccessful',
  partial: 'Partial success',
  cancelled: 'Cancelled',
  onHold: 'On hold',
  shipped: 'Shipped',
} as const

/** The meaning of each of those words, where it has one beyond "progress". */
export const AIT_STAGE_MEANING: Readonly<Record<string, 'out-for-delivery' | 'delivered' | 'failed'>> = {
  [AIT_STAGE.outForDelivery.toLowerCase()]: 'out-for-delivery',
  [AIT_STAGE.delivered.toLowerCase()]: 'delivered',
  [AIT_STAGE.unsuccessful.toLowerCase()]: 'failed',
}
