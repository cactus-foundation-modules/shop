import { formatDeliveryDay, formatDeliveryWindow } from '@/modules/shop/lib/delivery-slot'
import type { ShpShipment } from '@/modules/shop/lib/types'

// The order's activity line for an edit to a parcel already dispatched.
//
// The emails an edit sends show up in the activity on their own; the edit did
// not, so a window typed in with no email following left nothing behind at all
// and "did the customer hear about this?" had no answer on the order. This
// says what changed and, for the delivery day and window, whether the customer
// was told - and when not, why.
//
// Pure: the route hands it the parcel before and after the save and what it
// sent. Null when the save changed nothing worth a line.

type Parcel = Pick<
  ShpShipment,
  'deliveryDate' | 'deliverySlotStart' | 'deliverySlotEnd' | 'carrier' | 'trackingNumber' | 'trackingUrl' | 'notes' | 'quietCustomerEmails'
>

export type ParcelEditOutcome = {
  /** The customer was asked to be emailed (the box was left ticked). */
  wanted: boolean
  /** A window, day or new-date email went for the delivery. */
  deliveryEmailed: boolean
  trackingEmailed: boolean
}

function deliveryText(p: Parcel): string {
  const day = formatDeliveryDay(p.deliveryDate ?? '')
  if (!day) return 'no day'
  const window = formatDeliveryWindow(p.deliverySlotStart, p.deliverySlotEnd)
  return window ? `${day}, ${window}` : day
}

function same(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim() === (b ?? '').trim()
}

export function parcelEditNote(before: Parcel, after: Parcel, outcome: ParcelEditOutcome): string | null {
  const lines: string[] = []

  const deliveryChanged = !same(before.deliveryDate, after.deliveryDate)
    || !same(before.deliverySlotStart, after.deliverySlotStart)
    || !same(before.deliverySlotEnd, after.deliverySlotEnd)
  if (deliveryChanged) {
    const told = outcome.deliveryEmailed
      ? 'customer emailed'
      : after.quietCustomerEmails
        ? 'customer not emailed - this parcel is recorded without telling them'
        : !outcome.wanted
          ? 'customer not emailed - the email box was unticked'
          : after.deliveryDate && after.deliverySlotStart && after.deliverySlotEnd
            ? 'customer not emailed - they had already been told this day and window'
            : 'customer not emailed - nothing new to tell them until there is a day and both times'
    lines.push(`Delivery changed to ${deliveryText(after)} (was ${deliveryText(before)}); ${told}.`)
  }

  if (!same(before.carrier, after.carrier)) {
    lines.push(`Courier changed to ${after.carrier?.trim() || 'none'}.`)
  }
  const trackingChanged = !same(before.trackingNumber, after.trackingNumber) || !same(before.trackingUrl, after.trackingUrl)
  if (trackingChanged) {
    const tracking = [after.trackingNumber?.trim(), after.trackingUrl?.trim()].filter(Boolean).join(' · ') || 'none'
    lines.push(`Tracking changed to ${tracking}${outcome.trackingEmailed ? '; customer emailed' : ''}.`)
  }
  if (!same(before.notes, after.notes)) lines.push('Parcel notes changed.')

  return lines.length > 0 ? `Parcel details edited. ${lines.join(' ')}` : null
}
