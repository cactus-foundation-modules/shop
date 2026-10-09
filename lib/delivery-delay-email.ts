import { claimDelayAnsweredByCourier, getShipmentsForOrder, setSlotNotification } from '@/modules/shop/lib/db/shipments'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { parcelEmailVars } from '@/modules/shop/lib/delivery-slot-email'
import { deliveryBookingForShipment, formatDeliveryDay, formatDeliveryWindow, isWholeDayWindow, slotTimeFromInstant } from '@/modules/shop/lib/delivery-slot'
import { delayNoteForCustomer, isStaleCarrierWindow, type DelayKind } from '@/modules/shop/lib/delivery-delay'
import { calendarDateIn } from '@/lib/config/timezone'
import { getSiteTimezone } from '@/lib/config/timezone.server'
import type { ShpShipment } from '@/modules/shop/lib/types'

// The delay emails, sent from the order screen's "Report a delay" and from
// giving a delayed parcel its new day. See lib/delivery-delay.ts for the three
// kinds and migrations/070_delivery_delays.sql for what is stored.
//
//   today      'Delivery running late today'
//   rebooking  'Delivery delayed', with no new day (noNewDay)
//   new-date   'Delivery delayed', with the new day (hasNewDay)
//   later      'Delayed delivery: new date' - the day a rebooking promised
//
// No once-only stamps. Each is sent because a member of staff pressed a button
// asking for it to be, and a delay reported twice is two pieces of news.
//
// Silent no-op when anything it needs has gone, and for a quiet parcel (068).
// An email is never worth failing a delay that is already recorded.

/** The new day and its window, as the delayed and new-date emails word them:
 *  the booking as the customer's page shows it - the times typed with the
 *  day, or the courier's own window for it. A window the courier's feed still
 *  holds for the missed day is the one that fell through, and the booking
 *  leaves it out (see isStaleCarrierWindow). */
async function newDayVars(shipment: ShpShipment): Promise<Record<string, string>> {
  const booking = deliveryBookingForShipment(shipment, await getSiteTimezone())
  const day = formatDeliveryDay(booking.date)
  const window = day ? formatDeliveryWindow(booking.slotStart, booking.slotEnd) : ''
  return {
    deliveryDay: day,
    deliveryWindow: window,
    hasNewDay: day ? 'true' : 'false',
    hasNewDayOnly: day && !window ? 'true' : 'false',
    hasNewDayWindow: day && window ? 'true' : 'false',
    noNewDay: day ? 'false' : 'true',
  }
}

/**
 * An email that names the new window has told it, whichever the window came
 * from - typed with the day, or already in the courier's feed for it. Taking
 * the window email's stamp here is what stops the next tracking check sending
 * "your delivery time is confirmed" with the same news a minute later. Before
 * the send, as every once-only stamp in this module is.
 */
async function stampWhenItCarriesTheWindow(shipment: ShpShipment, vars: Record<string, string>): Promise<void> {
  if (vars.hasNewDayWindow === 'true' && !shipment.slotNotifiedAt) {
    await setSlotNotification(shipment.id, shipment.orderId, true)
  }
}

async function loadParcel(orderId: string, shipmentId: string) {
  const order = await getOrderById(orderId)
  if (!order) return null
  const shipment = (await getShipmentsForOrder(orderId)).find((s) => s.id === shipmentId)
  if (!shipment || shipment.quietCustomerEmails) return null
  return { order, shipment }
}

/** Tell the customer about a delay just recorded. Reads the parcel back, so
 *  the day it names is the one now stored. */
export async function sendDeliveryDelayEmail(params: {
  orderId: string
  shipmentId: string
  kind: DelayKind
}): Promise<boolean> {
  const loaded = await loadParcel(params.orderId, params.shipmentId)
  if (!loaded) return false
  const { order, shipment } = loaded

  const note = delayNoteForCustomer(shipment.deliveryDelayNote)
  const base: Record<string, string> = {
    ...await parcelEmailVars(order, shipment),
    delayNote: note,
    hasDelayNote: note ? 'true' : 'false',
  }

  if (params.kind === 'today') {
    await notifyOrderCustomer('DELIVERY_RUNNING_LATE', order, base)
    return true
  }

  // 'rebooking' cleared the day, so newDayVars gives the no-new-day version.
  const vars: Record<string, string> = { ...base, ...await newDayVars(shipment) }
  if (params.kind === 'new-date' && vars.hasNewDay !== 'true') return false
  await stampWhenItCarriesTheWindow(shipment, vars)
  await notifyOrderCustomer('DELIVERY_DELAYED', order, vars)
  return true
}

/** Tell the customer the new day a delayed parcel has been given. */
export async function sendDeliveryNewDateEmail(params: { orderId: string; shipmentId: string }): Promise<boolean> {
  const loaded = await loadParcel(params.orderId, params.shipmentId)
  if (!loaded) return false
  const { order, shipment } = loaded

  const day = await newDayVars(shipment)
  if (day.hasNewDay !== 'true') return false
  await stampWhenItCarriesTheWindow(shipment, day)
  await notifyOrderCustomer('DELIVERY_NEW_DATE', order, { ...await parcelEmailVars(order, shipment), ...day })
  return true
}

/**
 * The courier's own tracking has booked a day after the one a reported delay
 * missed - the new day the customer was told would follow. Tell them, with the
 * 'new date' email, and close the delay (claimDelayAnsweredByCourier).
 *
 * Runs before the ordinary window email (lib/tracking/store-reading.ts) and
 * in place of it: a running-late parcel still holds the stamp from the window
 * that fell through, so that email would never have gone. True when this
 * reading was that answer, whether or not anybody could be emailed.
 */
export async function maybeAnswerDelayFromCourier(
  parcel: Pick<ShpShipment, 'id' | 'orderId' | 'deliveryDelay' | 'deliveryDelayedFrom' | 'deliveredAt' | 'quietCustomerEmails'>,
  reading: { windowFrom: Date | null; windowTo: Date | null },
  timezone: string,
): Promise<boolean> {
  if (!parcel.deliveryDelay || !parcel.deliveryDelayedFrom || parcel.deliveredAt) return false
  if (!reading.windowFrom || !reading.windowTo) return false
  const windowDate = calendarDateIn(reading.windowFrom, timezone)
  if (isStaleCarrierWindow(parcel, windowDate) || windowDate <= parcel.deliveryDelayedFrom) return false
  const withWindow = !isWholeDayWindow(slotTimeFromInstant(reading.windowFrom, timezone), slotTimeFromInstant(reading.windowTo, timezone))
  if (!(await claimDelayAnsweredByCourier(parcel.id, windowDate, withWindow))) return false
  if (parcel.quietCustomerEmails) return true

  try {
    await sendDeliveryNewDateEmail({ orderId: parcel.orderId, shipmentId: parcel.id })
  } catch (error) {
    console.error('[shop] courier new-date email failed', error)
  }
  return true
}
