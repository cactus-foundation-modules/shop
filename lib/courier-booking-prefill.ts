import { isDueByWindow, isWholeDayWindow, type DeliveryBooking } from '@/modules/shop/lib/delivery-slot'

// The edit-parcel form, opened on a parcel whose day or window came from the
// courier's tracking rather than from somebody typing it.
//
// The order page shows the booking the customer reads (deliveryBookingForShipment):
// the parcel's own day and times where it has them, otherwise the courier's.
// The form used to show only the parcel's own columns, so a window the tracking
// had found read as "no delivery date" the moment somebody opened the parcel to
// edit it (order DW000285, 19 November 2026). Here the form is filled from the
// same booking the page shows.
//
// Filled is not saved. A value left exactly as the courier gave it is sent back
// blank, so the parcel keeps following the courier's tracking when they move it;
// only a value somebody changed becomes the shop's own and stands over theirs.
//
// A deadline is not a delivery day. Palletways' "currently due by 17:00" is the
// latest they promise, not when the lorry is coming, so a due-by window (00:00
// to a cut-off, isDueByWindow) is left out of the form altogether - its day
// included, where the day came with it rather than off the parcel. Their real
// window, the ETA the delivering depot sends on the morning, fills it as any
// courier's window does.

export type FormBooking = {
  deliveryDate: string
  deliverySlotStart: string
  deliverySlotEnd: string
}

type OwnBooking = {
  deliveryDate: string | null
  deliverySlotStart: string | null
  deliverySlotEnd: string | null
}

/** What the form opens with: the parcel's own values, with any blank filled
 *  from the courier's booking where that booking is a real day or window. */
export function courierPrefill(parcel: OwnBooking, booking: DeliveryBooking | undefined): FormBooking {
  const own: FormBooking = {
    deliveryDate: parcel.deliveryDate ?? '',
    deliverySlotStart: parcel.deliverySlotStart ?? '',
    deliverySlotEnd: parcel.deliverySlotEnd ?? '',
  }
  if (!booking?.date) return own
  // The parcel's own window is the booking; nothing of the courier's applies.
  if (own.deliverySlotStart && own.deliverySlotEnd) return own
  // A day typed on the parcel that the booking is not for: the courier's times
  // belong to another day.
  if (own.deliveryDate && own.deliveryDate !== booking.date) return own

  const dueBy = isDueByWindow(booking.slotStart, booking.slotEnd)
  const realWindow = Boolean(booking.slotStart && booking.slotEnd)
    && !dueBy
    && !isWholeDayWindow(booking.slotStart, booking.slotEnd)

  const ownTimes = Boolean(own.deliverySlotStart || own.deliverySlotEnd)
  return {
    deliveryDate: own.deliveryDate || (dueBy ? '' : booking.date),
    deliverySlotStart: ownTimes ? own.deliverySlotStart : realWindow ? booking.slotStart ?? '' : '',
    deliverySlotEnd: ownTimes ? own.deliverySlotEnd : realWindow ? booking.slotEnd ?? '' : '',
  }
}

/** The form's day and times as they should be saved.
 *
 *  Nothing of the courier's touched: everything they filled goes back blank,
 *  and the parcel keeps following their tracking. Their day changed and their
 *  times left as they were: the times were for the old day, so they go back
 *  blank and the new day stands alone. Anything else changed: the form is the
 *  shop's booking now, sent as shown - a day kept beside new times is the day
 *  those times are for. */
export function withoutUntouchedPrefill<T extends FormBooking>(details: T, parcel: OwnBooking, prefill: FormBooking): T {
  const filled = (key: keyof FormBooking) => !parcel[key] && prefill[key] !== ''
  const untouched = (key: keyof FormBooking) => filled(key) && details[key] === prefill[key]
  const keys: (keyof FormBooking)[] = ['deliveryDate', 'deliverySlotStart', 'deliverySlotEnd']
  const filledKeys = keys.filter(filled)
  if (filledKeys.length === 0) return details

  if (filledKeys.every(untouched)) {
    const blanked = { ...details }
    for (const key of filledKeys) blanked[key] = ''
    return blanked
  }
  const dayMoved = details.deliveryDate !== prefill.deliveryDate
  if (dayMoved && untouched('deliverySlotStart') && untouched('deliverySlotEnd')) {
    return { ...details, deliverySlotStart: '', deliverySlotEnd: '' }
  }
  return details
}

/** Whether the form opened with anything of the courier's in it, for the line
 *  that says so. */
export function prefillUsed(parcel: OwnBooking, prefill: FormBooking): boolean {
  return (!parcel.deliveryDate && prefill.deliveryDate !== '')
    || (!parcel.deliverySlotStart && prefill.deliverySlotStart !== '')
    || (!parcel.deliverySlotEnd && prefill.deliverySlotEnd !== '')
}
