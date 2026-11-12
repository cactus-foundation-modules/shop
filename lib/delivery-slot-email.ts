import { getShopConfigCached } from '@/modules/shop/lib/config'
import { claimCourierDay, claimMovedWindowNotification, claimSlotNotification, getOrderDispatchSummary, getShipmentsForOrder, recordToldWindow } from '@/modules/shop/lib/db/shipments'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { parcelCountVars } from '@/modules/shop/lib/consignment-parcels'
import { orderTrackingUrl } from '@/modules/shop/lib/order-tracking'
import { renderOrderItemsTable, type OrderEmailLine } from '@/modules/shop/lib/order-items-email'
import { orderItemEmailMedia } from '@/modules/shop/lib/order-item-email-media'
import {
  bookedDayStands,
  deliveryBookingForShipment,
  formatDeliveryDay,
  formatDeliveryWindow,
  isDueByWindow,
  isWholeDayWindow,
  slotTimeFromInstant,
  toldWindowKey,
} from '@/modules/shop/lib/delivery-slot'
import { courierFaqUrl, faqsForShipment } from '@/modules/shop/lib/courier-faqs'
import { isStaleCarrierWindow } from '@/modules/shop/lib/delivery-delay'
import { parcelCourierTimesEmailable } from '@/modules/shop/lib/tracking/provisional-window'
import { calendarDateIn } from '@/lib/config/timezone'
import type { ShpOrder, ShpShipment, ShpShipmentWithItems } from '@/modules/shop/lib/types'

// "Your delivery is confirmed for Tuesday, between 10:00 and 13:00."
//
// The second of the two emails a delivery gets, and the one people actually
// act on: the dispatch note says a parcel exists, this one says which morning
// to be in. It is sent when the window is written onto a parcel that already
// went out, which on a two-stage courier is a day or two later.
//
// Sent at most once per parcel. The route claims the right to send it in the
// same statement that records it (claimSlotNotification), so correcting a typo
// on the parcel afterwards does not send it again.
//
// Silent no-op when anything it needs has gone: the parcel, the order, or the
// window itself. An email is not worth failing an edit that already committed.

function hasCompleteBookedSlot(shipment: Pick<ShpShipment, 'deliveryDate' | 'deliverySlotStart' | 'deliverySlotEnd'>): boolean {
  return Boolean(shipment.deliveryDate && shipment.deliverySlotStart && shipment.deliverySlotEnd)
}

function deliveryEmailParts(
  shipment: Pick<ShpShipment, 'deliveryDate' | 'deliverySlotStart' | 'deliverySlotEnd' | 'deliveryWindowFrom' | 'deliveryWindowTo'>,
  timezone: string,
  courierTimes: boolean,
): { day: string; window: string; slotStart: string; slotEnd: string; told: string } | null {
  const booking = deliveryBookingForShipment(shipment, timezone, { courierTimes })
  const day = formatDeliveryDay(booking.date)
  const window = formatDeliveryWindow(booking.slotStart, booking.slotEnd)
  if (!day || !window || !booking.slotStart || !booking.slotEnd) return null
  return { day, window, slotStart: booking.slotStart, slotEnd: booking.slotEnd, told: toldWindowKey(booking) }
}

/** What is in THIS parcel and who is bringing it, shared by the day and the
 *  window emails so the two read as one conversation. */
export async function parcelEmailVars(
  order: ShpOrder,
  shipment: ShpShipmentWithItems,
): Promise<Record<string, string>> {
  const config = await getShopConfigCached()

  // What is in THIS parcel, so somebody with a split order knows which half is
  // arriving. Names come off the dispatch summary the order screen reads, so
  // the email cannot disagree with it; pictures and links the same way the
  // dispatch note has them, so the two read as one order.
  const [summary, media] = await Promise.all([
    getOrderDispatchSummary(order.id),
    orderItemEmailMedia(order.id, config),
  ])
  const nameByOrderItemId = new Map(summary.lines.map((l) => [l.orderItemId, l.productName]))
  const lines: OrderEmailLine[] = shipment.items
    .map((item) => ({
      name: nameByOrderItemId.get(item.orderItemId) ?? 'Item',
      quantity: item.quantity,
      imageUrl: media.imageFor(item.orderItemId),
      url: media.linkFor(item.orderItemId),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const orderUrl = orderTrackingUrl(order.orderNumber, config)
  const faqs = faqsForShipment(config, shipment)
  const faqUrl = faqs.length > 0 ? courierFaqUrl(orderUrl) : ''
  const carrier = shipment.carrier?.trim() ?? ''

  return {
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    parcelItems: lines.length > 0 ? renderOrderItemsTable(lines) : '',
    hasParcelItems: lines.length > 0 ? 'true' : 'false',
    carrier,
    hasCarrier: carrier ? 'true' : 'false',
    // The day email's "as soon as the courier gives us one", for a parcel
    // with no courier named. Core's {{#if}} has no else.
    noCarrier: carrier ? 'false' : 'true',
    faqUrl,
    hasFaq: faqUrl ? 'true' : 'false',
    shopName: config.shopTitle || 'Shop',
    // "It is coming in 4 parcels", where the courier has told us so.
    ...parcelCountVars([shipment]),
  }
}

export async function sendDeliverySlotEmail(params: {
  orderId: string
  shipmentId: string
  timezone: string
}): Promise<void> {
  const order = await getOrderById(params.orderId)
  if (!order) return

  const shipment = (await getShipmentsForOrder(params.orderId)).find((s) => s.id === params.shipmentId)
  // A quiet parcel (068) tells the customer nothing.
  if (!shipment || shipment.quietCustomerEmails) return

  // A courier whose tracking page shows a holding window has only the times
  // on the parcel itself emailed (lib/tracking/provisional-window.ts).
  const courierTimes = parcelCourierTimesEmailable(await getShopConfigCached(), shipment)
  const parts = deliveryEmailParts(shipment, params.timezone, courierTimes)
  if (!parts) return

  await notifyOrderCustomer('DELIVERY_SLOT_CONFIRMED', order, {
    ...await parcelEmailVars(order, shipment),
    deliveryDay: parts.day,
    deliveryWindow: parts.window,
    deliverySlotStart: parts.slotStart,
    deliverySlotEnd: parts.slotEnd,
  }, { shipmentId: shipment.id, toldWindow: parts.told })
  // Which window went, so a later save is judged against what the customer
  // read (see maybeSendSlotEmail). Not reached when the send failed: the
  // retry records it if and when the email does go (lib/order-email-retry.ts).
  await recordToldWindow(shipment.id, params.orderId, parts.told)
}

/**
 * "Your delivery is booked in for Tuesday" - the day, before the courier has
 * given a window for it.
 *
 * A separate message from the window one rather than the same one with a gap
 * in it: a shop's own wording for the window email is written around a time,
 * and "booked in for Tuesday, ." is what it would print with none. This one
 * says the time is still to come, and the window email follows once it is.
 *
 * Not stamped. It goes when the DAY is new or has moved, which is the caller's
 * test (see the dispatch route), because a moved day is exactly the thing a
 * customer who has already been told one needs to hear about.
 */
export async function sendDeliveryDayEmail(params: { orderId: string; shipmentId: string }): Promise<void> {
  const order = await getOrderById(params.orderId)
  if (!order) return

  const shipment = (await getShipmentsForOrder(params.orderId)).find((s) => s.id === params.shipmentId)
  if (!shipment || shipment.quietCustomerEmails) return

  const deliveryDay = formatDeliveryDay(shipment.deliveryDate ?? '')
  if (!deliveryDay) return

  await notifyOrderCustomer('DELIVERY_DAY_BOOKED', order, {
    ...await parcelEmailVars(order, shipment),
    deliveryDay,
  }, { shipmentId: shipment.id })
}

/**
 * The day the courier's own tracking has booked (Multidrop's "Date Scheduled"),
 * put on the parcel and told to the customer with the day email - the same one
 * staff typing a day sends. Order DW000250, 10 November 2026: booked for the
 * 11th on the courier's page, and nothing on the order or in the customer's
 * inbox.
 *
 * Told when the day on the parcel is new or has moved, as staff saving a day
 * is (maybeSendDayEmail), and never once a window has been told: that email
 * named the day, and a move after it is the moved-window email's to tell
 * (maybeSendMovedDayEmail), which reads the day written here. A day in the
 * past is a page left standing after the event, and is not taken at all.
 *
 * Whether it may be taken at all - a day staff typed, a booked slot, a delay -
 * is claimCourierDay's call, made in the same statement that writes it.
 */
export async function maybeSendCourierDayEmail(
  parcel: Pick<ShpShipment, 'id' | 'orderId' | 'quietCustomerEmails' | 'deliveredAt'>,
  day: string | null,
  timezone: string,
): Promise<boolean> {
  if (!day || parcel.deliveredAt) return false
  if (day < calendarDateIn(new Date(), timezone)) return false
  const claimed = await claimCourierDay(parcel.id, day)
  if (!claimed?.dayChanged || claimed.windowTold || parcel.quietCustomerEmails) return false

  try {
    await sendDeliveryDayEmail({ orderId: parcel.orderId, shipmentId: parcel.id })
  } catch (error) {
    console.error('[shop] courier day email failed', error)
  }
  return true
}

/** Tell the customer their delivery window, when the courier's own tracking
 *  reports one and nobody has been emailed yet. Uses the same message and the
 *  same once-only stamp as an owner typing the window in by hand.
 *
 *  Never for a courier whose tracking page shows a holding window (AIT, see
 *  lib/tracking/provisional-window.ts): the caller passes `courierTimes`
 *  false, and the stamp is kept for the window that is actually emailed. */
export async function maybeSendCarrierWindowEmail(
  parcel: Pick<
    ShpShipment,
    | 'id'
    | 'orderId'
    | 'deliveryDate'
    | 'deliverySlotStart'
    | 'deliverySlotEnd'
    | 'deliveryWindowFrom'
    | 'deliveryWindowTo'
    | 'slotNotifiedAt'
    | 'slotNotifiedWindow'
    | 'quietCustomerEmails'
    | 'deliveryDelay'
    | 'deliveryDelayedFrom'
  >,
  reading: { windowFrom: Date | null; windowTo: Date | null },
  timezone: string,
  courierTimes: boolean,
): Promise<boolean> {
  if (!courierTimes) return false
  if (parcel.quietCustomerEmails) return false
  if (hasCompleteBookedSlot(parcel)) return false
  if (!reading.windowFrom || !reading.windowTo) return false
  if (parcel.slotNotifiedAt) return maybeSendMovedDayEmail(parcel, reading, timezone)
  // The window for the day a reported delay missed is the booking that fell
  // through, still in the courier's feed - not news, and not worth the stamp.
  if (isStaleCarrierWindow(parcel, calendarDateIn(reading.windowFrom, timezone))) return false
  // A window for another day than the one booked on the parcel is not the
  // booking (bookedDayStands): the email would name the booked day with no
  // times, so it is not sent and the stamp is kept for a window that matches.
  if (bookedDayStands(parcel) && calendarDateIn(reading.windowFrom, timezone) !== parcel.deliveryDate) return false
  // The whole day is the day booked, not a time: there is no window to tell,
  // and the stamp is kept for the real one when it comes.
  if (isWholeDayWindow(slotTimeFromInstant(reading.windowFrom, timezone), slotTimeFromInstant(reading.windowTo, timezone))) return false
  if (!(await claimSlotNotification(parcel.id, parcel.orderId))) return false

  try {
    await sendDeliverySlotEmail({ orderId: parcel.orderId, shipmentId: parcel.id, timezone })
  } catch (error) {
    console.error('[shop] carrier window email failed', error)
  }
  return true
}

/**
 * A customer already told a window, whose courier has since booked a
 * DIFFERENT day: the old email is now wrong, and nobody else will correct it.
 * (Order DW000231: told Friday 11:56 to 12:56, rebooked for Saturday by hand
 * with no times, and DPD's Saturday window arrived overnight to a stamp that
 * said "already told".)
 *
 * Only a change of day - or, once, a deadline becoming a real window on the
 * same day (below). The courier's window drifts by the hour as the round
 * progresses, and an email for each drift would be a nuisance, not a service.
 * The window must also be for the day on the parcel, so a feed still holding
 * the day that fell through is not mistaken for the new booking.
 */
async function maybeSendMovedDayEmail(
  parcel: Parameters<typeof maybeSendCarrierWindowEmail>[0],
  reading: { windowFrom: Date | null; windowTo: Date | null },
  timezone: string,
): Promise<boolean> {
  if (!parcel.slotNotifiedWindow || !reading.windowFrom || !reading.windowTo) return false
  const date = calendarDateIn(reading.windowFrom, timezone)
  const start = slotTimeFromInstant(reading.windowFrom, timezone)
  const end = slotTimeFromInstant(reading.windowTo, timezone)
  if (isWholeDayWindow(start, end)) return false
  // The one same-day change worth an email: a customer told only a deadline
  // ("by 17:00", Palletways' service time) whose courier has since planned the
  // round and given a real window ("between 08:24 and 10:24"). Once, because
  // the claim below records the real window, and later drifts are not news.
  const toldDate = parcel.slotNotifiedWindow.slice(0, 10)
  const [toldStart = null, toldEnd = null] = parcel.slotNotifiedWindow.slice(11).split('-')
  const narrowed = toldDate === date && isDueByWindow(toldStart, toldEnd) && !isDueByWindow(start, end)
  // A deadline-only courier seldom has a day typed on the parcel; the day the
  // customer was told is the booking there.
  if (date !== (parcel.deliveryDate || (narrowed ? toldDate : null))) return false
  if (isStaleCarrierWindow(parcel, date)) return false
  if (toldDate === date && !narrowed) return false
  if (!(await claimMovedWindowNotification(parcel.id, parcel.orderId, parcel.slotNotifiedWindow, `${date} ${start}-${end}`))) return false

  try {
    await sendDeliverySlotEmail({ orderId: parcel.orderId, shipmentId: parcel.id, timezone })
  } catch (error) {
    console.error('[shop] moved-day window email failed', error)
  }
  return true
}
