import type { ShpDeliveryDelay } from '@/modules/shop/lib/types'

// A delivery the shop has said is running late (migration 070), and what that
// means at any given moment.
//
// Pure, and it takes today's date as an argument, because the email, the order
// page and the order screen all have to agree about it to the letter.
//
// Three things can be reported, and the third is not stored as a delay at all:
//
//   'today'      "We are running late, but still trying to get to you today. If
//                we cannot, we will be in touch with a new day." True on the day
//                it was said and no longer: by the next morning it did not
//                happen, and what stands is the second half of the sentence -
//                a new day to follow - so from then on it reads as 'rebooking'.
//   'rebooking'  "Your delivery is delayed; we will be in touch with a new day."
//                The old day is cleared when this is reported.
//   a new day    "Your delivery is delayed until Tuesday." Closes any delay
//                there was; what is left is an ordinary booking.
//
// A delay also closes by itself when the courier books a day after the one that
// was missed - their tracking reporting a window on Thursday answers "when?" as
// well as staff typing it in would - and when the parcel arrives.

export type DelayKind = 'today' | 'rebooking' | 'new-date'

export type DelayedParcel = {
  deliveryDelay?: ShpDeliveryDelay | null
  deliveryDelayedFrom?: string | null
  deliveredAt?: Date | null
}

/**
 * The delay as it stands on `today`, or null for none.
 *
 * `bookedDate` is the day the parcel is booked for as the customer would be
 * told it (deliveryBookingForShipment) - '' for none. A booking after the
 * missed day is a new day, and a new day is the end of a delay.
 */
export function currentDelay(
  parcel: DelayedParcel,
  bookedDate: string,
  today: string,
): ShpDeliveryDelay | null {
  if (!parcel.deliveryDelay || parcel.deliveredAt) return null
  const missed = parcel.deliveryDelayedFrom ?? ''
  if (missed && bookedDate && bookedDate > missed) return null
  if (parcel.deliveryDelay === 'today') return missed === today ? 'today' : 'rebooking'
  return 'rebooking'
}

/**
 * Whether a window the courier's own tracking reports is the booking that fell
 * through, and so not to be shown as the delivery. A window on or before the
 * missed day is - except while the shop is saying it is still coming today,
 * when today's window is exactly the one still being aimed at.
 */
export function isStaleCarrierWindow(
  parcel: DelayedParcel,
  windowDate: string,
): boolean {
  const missed = parcel.deliveryDelayedFrom ?? ''
  if (!missed || !windowDate) return false
  if (windowDate > missed) return false
  return !(parcel.deliveryDelay === 'today' && windowDate === missed)
}

/** A delay that is open and was reported at or after the courier's latest
 *  stage, so it outranks a failed attempt that stage reported. */
export function delayIsNewerThanStage(
  delay: ShpDeliveryDelay | null,
  parcel: { deliveryDelayedAt?: Date | null; trackingStageAt?: Date | null },
): boolean {
  if (!delay || !parcel.deliveryDelayedAt) return false
  return !parcel.trackingStageAt || parcel.deliveryDelayedAt >= parcel.trackingStageAt
}

/** The staff's sentence, tidied for the customer: trimmed, and '' for none. */
export function delayNoteForCustomer(note: string | null | undefined): string {
  return note?.trim().replace(/\s+/g, ' ') ?? ''
}
