import type { ShpConfig } from '@/modules/shop/lib/config'
import { claimSlotNotification, claimTrackingNotification, getOrderDispatchSummary } from '@/modules/shop/lib/db/shipments'
import { applyOrderStatusChange } from '@/modules/shop/lib/order-status'
import { hasFollowableTracking, sendTrackingAddedEmail } from '@/modules/shop/lib/tracking-added-email'
import { sendDeliveryDayEmail, sendDeliverySlotEmail } from '@/modules/shop/lib/delivery-slot-email'
import { isDeliveryDate } from '@/modules/shop/lib/delivery-slot'
import { getSiteTimezone } from '@/lib/config/timezone.server'
import { DPD_FOLLOW_LINK_EXAMPLE, dpdFollowLink, dpdFollowLinkCode } from '@/modules/shop/lib/tracking/dpd-follow-link'
import { AIT_LINK_EXAMPLE, aitLink, aitLinkParts } from '@/modules/shop/lib/tracking/ait-link'
import type { ShpOrderStatus, ShpShipmentWithItems } from '@/modules/shop/lib/types'

// What happens around recording a parcel, shared by the two things that record
// one: the order screen's dispatch route, and a despatch announced by another
// module from the supplier's own tracking (lib/despatch-observer.ts). Moved
// here from the route unchanged, so the two can never disagree about which
// link a DPD parcel keeps, when the customer is told about a window or about
// tracking that arrived late, or when the order's status follows its parcels.
//
// The three emails below say nothing for a quiet parcel (migration 068: one
// recorded from a supplier's tracking while the shop was set to "record
// only"), and take no once-only stamp for it either.

/** The courier's tracking is read from DPD, which is what makes its one
 *  tracking link the follow-my-parcel link and nothing else. */
export function courierTakesDpdLink(config: Pick<ShpConfig, 'deliveryCouriers'>, courierId: string | null): boolean {
  return config.deliveryCouriers.find((c) => c.id === courierId)?.trackingSource === 'dpd'
}

/** The courier's tracking is read from AIT Home Delivery, whose one link is
 *  the short aithd.com address - the code in it is the whole parcel to them. */
export function courierTakesAitLink(config: Pick<ShpConfig, 'deliveryCouriers'>, courierId: string | null): boolean {
  return config.deliveryCouriers.find((c) => c.id === courierId)?.trackingSource === 'ait'
}

export const WRONG_AIT_LINK = `For AIT Home Delivery the tracking link has to be the short link from their message, like ${AIT_LINK_EXAMPLE}.`

export const WRONG_DPD_LINK = `For DPD the tracking link has to be the follow-my-parcel link from their email, like ${DPD_FOLLOW_LINK_EXAMPLE}.`

export type TrackingLink = {
  trackingUrl: string | null
  trackingShortCode: string | null
  /** Present, and null, only on an AIT courier: they take no tracking number,
   *  so one sent anyway (by an older form, a script, a supplier's announcement)
   *  is cleared rather than stored where the edit form can no longer show it. */
  trackingNumber?: null
}

/**
 * The one tracking link, checked against the courier it went with.
 *
 * On a DPD courier it must be the follow-my-parcel link: that is the link whose
 * code opens their full feed, and it is the only DPD link a customer can follow
 * without a parcel number to hand. Anything else is refused here rather than
 * saved and quietly never read. It is stored in one canonical shape, with its
 * code alongside for the tracking check.
 *
 * Any other courier takes any web address, as it always has, and carries no
 * code - a code left over from when the parcel was down as DPD would have the
 * tracking check asking DPD about somebody else's van.
 */
export function trackingLinkFor(
  config: Pick<ShpConfig, 'deliveryCouriers'>,
  courierId: string | null,
  trackingUrl: string | null,
): { ok: true; link: TrackingLink } | { ok: false; error: string } {
  // AIT: the short link and nothing else, kept in one canonical shape, and no
  // tracking number. No code is stored beside the link - the reader takes it
  // back out, and a code column holding something that is not a DPD code would
  // be read as one.
  if (courierTakesAitLink(config, courierId)) {
    if (!trackingUrl) return { ok: true, link: { trackingUrl: null, trackingShortCode: null, trackingNumber: null } }
    const parts = aitLinkParts(trackingUrl)
    if (!parts) return { ok: false, error: WRONG_AIT_LINK }
    return { ok: true, link: { trackingUrl: aitLink(parts), trackingShortCode: null, trackingNumber: null } }
  }
  if (!trackingUrl) return { ok: true, link: { trackingUrl: null, trackingShortCode: null } }
  if (!courierTakesDpdLink(config, courierId)) return { ok: true, link: { trackingUrl, trackingShortCode: null } }
  const code = dpdFollowLinkCode(trackingUrl)
  if (!code) return { ok: false, error: WRONG_DPD_LINK }
  return { ok: true, link: { trackingUrl: dpdFollowLink(code), trackingShortCode: code } }
}

/**
 * Tell the customer their delivery window, if this save is the moment it became
 * knowable and nobody has been told yet.
 *
 * A day on its own is not enough: "your delivery is confirmed" with no window
 * in it is the dispatch note again, and the second email is only worth sending
 * because it carries something the first one could not.
 *
 * The claim is taken BEFORE the send and never given back. A mail server that
 * refuses the message has not made the parcel undelivered, and retrying it on
 * the owner's next save - which is usually a typo correction - would land a
 * second copy in front of a customer who already had the first.
 */
export async function maybeSendSlotEmail(
  orderId: string,
  shipment: ShpShipmentWithItems,
  wanted: boolean,
): Promise<boolean> {
  if (!wanted || shipment.quietCustomerEmails) return false
  if (!shipment.deliveryDate || !shipment.deliverySlotStart || !shipment.deliverySlotEnd) return false
  if (shipment.slotNotifiedAt) return false
  if (!(await claimSlotNotification(shipment.id, orderId))) return false

  try {
    const timezone = await getSiteTimezone()
    await sendDeliverySlotEmail({ orderId, shipmentId: shipment.id, timezone })
  } catch (error) {
    console.error('[shop] delivery slot email failed', error)
  }
  return true
}

/**
 * Tell the customer the day, when this save booked one and there is no window
 * on it yet.
 *
 * The window email above is the one that matters, and once it has gone this
 * stays quiet: that email already named the day, and moving a day after a
 * window was confirmed is a rebooking, not a booking. Before then the day is
 * news whenever it is new or has moved, so there is no once-only stamp here -
 * a customer told Tuesday who is now getting Thursday has to hear it. The
 * price is that correcting a day typed wrong sends the right one, which is the
 * correction the customer needed anyway.
 *
 * A day recorded at dispatch is not sent from here: the dispatch note carries
 * it (see dispatchDeliveryVars).
 */
export async function maybeSendDayEmail(
  orderId: string,
  before: ShpShipmentWithItems,
  after: ShpShipmentWithItems,
  wanted: boolean,
): Promise<boolean> {
  if (!wanted || after.quietCustomerEmails) return false
  if (!isDeliveryDate(after.deliveryDate)) return false
  if (after.deliveryDate === before.deliveryDate) return false
  if (after.deliverySlotStart && after.deliverySlotEnd) return false
  if (after.slotNotifiedAt) return false

  try {
    await sendDeliveryDayEmail({ orderId, shipmentId: after.id })
  } catch (error) {
    console.error('[shop] delivery day email failed', error)
  }
  return true
}

/**
 * Tell the customer the tracking, if this save is the moment it appeared.
 *
 * The test is that the parcel GAINED something followable. A parcel dispatched
 * with its number already on it carried that number in its dispatch note, and a
 * second email repeating it is noise; a parcel that went out with nothing had a
 * dispatch note saying the goods had left and giving no way of following them,
 * which is the gap this closes.
 *
 * A courier name alone is not tracking - it is who has the box - so changing
 * "DPD" to "DPD Local" sends nothing. See hasFollowableTracking.
 *
 * The claim is taken BEFORE the send and never given back, exactly as the
 * window email's is: a mail server refusing the message has not un-tracked the
 * parcel, and retrying on the owner's next save - usually a typo correction -
 * would land a second copy in front of somebody who already had the first.
 */
export async function maybeSendTrackingEmail(
  orderId: string,
  before: ShpShipmentWithItems,
  after: ShpShipmentWithItems,
  wanted: boolean,
): Promise<boolean> {
  if (!wanted || after.quietCustomerEmails) return false
  if (hasFollowableTracking(before)) return false
  if (!hasFollowableTracking(after)) return false
  if (after.trackingNotifiedAt) return false
  if (!(await claimTrackingNotification(after.id, orderId))) return false

  try {
    await sendTrackingAddedEmail({ orderId, shipmentId: after.id })
  } catch (error) {
    console.error('[shop] tracking email failed', error)
  }
  return true
}

/**
 * Keep the order's status in step with its parcels.
 *
 * The status and the dispatch record are two separate things an owner sets, and
 * the customer's order page reads its headline off the status. Recording every
 * parcel without also changing the dropdown left a replacement whose customer
 * had been emailed "on its way" looking at a page that said "Being prepared".
 * So the last parcel moves a PROCESSING order on to SHIPPED, and undoing a
 * parcel moves a SHIPPED order that is no longer fully dispatched back again.
 *
 * Only those two statuses are touched. PENDING has not been paid for, ON_HOLD
 * was put there by somebody on purpose, and COMPLETED and the refunded and
 * cancelled states say something a parcel record has no business overruling.
 *
 * It goes through applyOrderStatusChange so invoicing on dispatch and the
 * pre-order rules behave exactly as they do from the dropdown. No email: the
 * dispatch note is this route's to send, and an undo is not news to a customer.
 * A refusal is logged and stepped over - the parcel is recorded either way, and
 * the dropdown is still there.
 */
export async function followDispatchWithStatus(
  orderId: string,
  statusBefore: ShpOrderStatus,
  change: 'recorded' | 'undone',
): Promise<void> {
  const wanted: { from: ShpOrderStatus; to: ShpOrderStatus } = change === 'recorded'
    ? { from: 'PROCESSING', to: 'SHIPPED' }
    : { from: 'SHIPPED', to: 'PROCESSING' }
  if (statusBefore !== wanted.from) return

  try {
    const { fullyDispatched } = await getOrderDispatchSummary(orderId)
    if (fullyDispatched !== (change === 'recorded')) return

    const result = await applyOrderStatusChange({ orderId, status: wanted.to, sendEmail: false })
    if (!result.ok) console.warn(`[shop] dispatch could not move order ${orderId} to ${wanted.to}: ${result.error}`)
  } catch (error) {
    console.error('[shop] dispatch status follow-up failed', orderId, error)
  }
}
