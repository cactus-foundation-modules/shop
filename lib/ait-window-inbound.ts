import { calendarDateIn } from '@/lib/config/timezone'
import { getSiteTimezone } from '@/lib/config/timezone.server'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { courierForShipment } from '@/modules/shop/lib/courier-faqs'
import { addOrderNote } from '@/modules/shop/lib/db/orders'
import { getShipmentsForOrder, openAitParcels, updateShipmentDetails } from '@/modules/shop/lib/db/shipments'
import { deliveryBookingForShipment, formatDeliveryDay, formatDeliveryWindow, slotTimeFromInstant } from '@/modules/shop/lib/delivery-slot'
import { maybeSendSlotEmail, newDayAfterDelay } from '@/modules/shop/lib/dispatch-follow-up'
import { EMAIL_NOT_GONE } from '@/modules/shop/lib/parcel-edit-note'
import { addressEndsWithPostcode, isAitSender, readAitWindowEmail, type AitWindowEmail } from '@/modules/shop/lib/tracking/ait-window-email'
import type { ShpShipmentWithItems } from '@/modules/shop/lib/types'

// AIT's own "time window" email, put on the parcel it is about.
//
// AIT's tracking page shows a holding window until the evening before, so the
// times read off it are never emailed to the customer (lib/tracking/
// provisional-window.ts). The real window arrives as an email from AIT to the
// shop. This reads it as it lands in the unified inbox and writes the window
// onto the parcel exactly as typing it in on the order screen would, through
// the same rules for telling the customer: the window email if they have not
// been told this window, nothing if they have.
//
// Registered against `unified-inbox.message-received`. The event is restated
// here as plain values and nothing imports the inbox, so on a site without it
// this is simply never called. It does nothing on a shop with no courier
// reading AIT's tracking.
//
// The email names no tracking code and no order number of ours, so the parcel
// is found the careful way: an AIT parcel still on its way, to an order whose
// delivery postcode is the one the email prints, booked (by the courier or by
// hand) for the day the email names. More than one left after that, and the
// courier's own times for the day decide it; still more than one, and nothing
// is written - a note on the email says why, and the window can be typed in.
//
// Idempotent on the message, as the inbox requires: a second offer finds the
// window already on the parcel and the customer already told it.

/** The inbox's payload, restated. Structural: it may send more. */
export type InboundMessageEvent = {
  messageId: string
  threadId: string
  fromAddress: string
  toAddresses: string[]
  subject: string
  bodyText: string
  sentAt: string
}

/** What the inbox accepts back. Restated for the same reason. */
export type InboundMessageOutcome = {
  links?: Array<{ moduleName: string; recordType: string; recordId: string; label: string }>
  note?: string
}

type Found = { parcel: ShpShipmentWithItems; orderNumber: string }

/** The day the courier's own tracking has the parcel on, if any. */
function courierDay(parcel: ShpShipmentWithItems, timezone: string): string | null {
  return parcel.deliveryWindowFrom ? calendarDateIn(parcel.deliveryWindowFrom, timezone) : null
}

/** The parcel this window email is about, or why there is not one. Exported
 *  for the tests; `parcels` are the open AIT parcels to that postcode. */
export function pickParcel(
  read: AitWindowEmail,
  parcels: readonly Found[],
  timezone: string,
): { found: Found } | { reason: string } | null {
  if (parcels.length === 0) return null
  const onTheDay = parcels.filter(({ parcel }) => {
    const booked = deliveryBookingForShipment(parcel, timezone, { courierTimes: false }).date
    return booked === read.date || parcel.deliveryDate === read.date || courierDay(parcel, timezone) === read.date
  })
  if (onTheDay.length === 1) return { found: onTheDay[0]! }
  if (onTheDay.length === 0) {
    return { reason: `An AIT delivery window for ${formatDeliveryDay(read.date)}, but no AIT parcel to that postcode is booked for that day, so it has not been put on one.` }
  }
  const sameTimes = onTheDay.filter(({ parcel }) => parcel.deliveryWindowFrom && parcel.deliveryWindowTo
    && slotTimeFromInstant(parcel.deliveryWindowFrom, timezone) === read.slotStart
    && slotTimeFromInstant(parcel.deliveryWindowTo, timezone) === read.slotEnd)
  if (sameTimes.length === 1) return { found: sameTimes[0]! }
  return {
    reason: `An AIT delivery window that could be for ${onTheDay.map((f) => f.orderNumber).join(' or ')}, so it has not been put on either - type it in on the right one.`,
  }
}

/** Read one email, and if it is AIT's window for one of our parcels, put it
 *  on the parcel and tell the customer as the order screen would. */
export async function handleAitWindowEmail(
  event: InboundMessageEvent,
  context?: { signal?: AbortSignal },
): Promise<InboundMessageOutcome> {
  if (!isAitSender(event.fromAddress)) return {}
  const read = readAitWindowEmail(event.bodyText)
  if (!read || !read.address) return {}

  const config = await getShopConfigCached()
  if (!config.deliveryCouriers.some((c) => c.trackingSource === 'ait')) return {}

  const toPostcode = (await openAitParcels()).filter((p) => addressEndsWithPostcode(read.address, p.postcode))
  if (toPostcode.length === 0) return {}

  const timezone = await getSiteTimezone()
  const found: Found[] = []
  for (const orderId of new Set(toPostcode.map((p) => p.orderId))) {
    const shipments = await getShipmentsForOrder(orderId)
    for (const row of toPostcode.filter((p) => p.orderId === orderId)) {
      const parcel = shipments.find((s) => s.id === row.shipmentId)
      if (parcel && courierForShipment(config, parcel)?.trackingSource === 'ait') {
        found.push({ parcel, orderNumber: row.orderNumber })
      }
    }
  }

  const picked = pickParcel(read, found, timezone)
  if (!picked) return {}
  if ('reason' in picked) return { note: picked.reason }
  if (context?.signal?.aborted) return {}

  const { parcel: before, orderNumber } = picked.found
  const orderId = before.orderId
  const link = { moduleName: 'shop', recordType: 'order', recordId: orderId, label: orderNumber }
  const when = `${formatDeliveryDay(read.date)}, ${formatDeliveryWindow(read.slotStart, read.slotEnd)}`

  const patch: { deliveryDate?: string; deliverySlotStart?: string; deliverySlotEnd?: string } = {}
  if (before.deliveryDate !== read.date) patch.deliveryDate = read.date
  if (before.deliverySlotStart !== read.slotStart || before.deliverySlotEnd !== read.slotEnd) {
    patch.deliverySlotStart = read.slotStart
    patch.deliverySlotEnd = read.slotEnd
  }
  if (Object.keys(patch).length === 0) {
    return { links: [link], note: `AIT's delivery window for ${orderNumber} (${when}) is already on the parcel` }
  }

  const after = await updateShipmentDetails(before.id, orderId, patch)
  if (!after) return { links: [link] }

  // A new day for a delayed parcel is the 'new date' email the delay promised;
  // otherwise the window email, if this is a window the customer has not had.
  const answered = await newDayAfterDelay(orderId, before, after, true)
  const emailed = answered ?? await maybeSendSlotEmail(orderId, after, true, before)

  const told = emailed === 'failed'
    ? EMAIL_NOT_GONE
    : emailed
      ? 'customer emailed'
      : after.quietCustomerEmails
        ? 'customer not emailed - this parcel is recorded without telling them'
        : 'customer not emailed - they had already been told this day and window'
  await addOrderNote(orderId, `AIT emailed the delivery window: ${when}; ${told}.`, true, null).catch((error) => {
    console.error('[shop] AIT window note failed', orderId, error)
  })

  return {
    links: [link],
    note: `Delivery window for ${orderNumber} set from this email (${when})${emailed === true ? ', customer emailed' : emailed === 'failed' ? `, ${EMAIL_NOT_GONE}` : ''}`,
  }
}

/** What the manifest entry names. */
export const shopAitWindowEmailHandler = (
  event: InboundMessageEvent,
  context?: { signal?: AbortSignal },
): Promise<InboundMessageOutcome> => handleAitWindowEmail(event, context)
