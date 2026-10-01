import { getShopConfigCached, type ShpConfig } from '@/modules/shop/lib/config'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import {
  createShipment,
  fillBlankShipmentTracking,
  getOrderDispatchSummary,
  getShipmentsForOrder,
  updateShipmentDetails,
} from '@/modules/shop/lib/db/shipments'
import { isDeliveryDate, isSlotTime, slotMinutes } from '@/modules/shop/lib/delivery-slot'
import {
  courierTakesDpdLink,
  followDispatchWithStatus,
  maybeSendDayEmail,
  maybeSendSlotEmail,
  maybeSendTrackingEmail,
} from '@/modules/shop/lib/dispatch-follow-up'
import { sendShipmentDispatchedEmail } from '@/modules/shop/lib/shipment-email'
import { hasFollowableTracking } from '@/modules/shop/lib/tracking-added-email'
import { safeTrackingUrl } from '@/modules/shop/lib/tracking-url'
import { dpdFollowLink, dpdFollowLinkCode } from '@/modules/shop/lib/tracking/dpd-follow-link'
import { isKnownCarrierLink } from '@/modules/shop/lib/tracking/known-carrier-hosts'
import { isMultidropUrl } from '@/modules/shop/lib/tracking/multidrop'
import type { ShpShipmentWithItems } from '@/modules/shop/lib/types'

// A despatch another module has recorded against this shop's order lines, put
// on the customer's order.
//
// Registered against `purchase-orders.despatch-recorded`. Shop stays generic:
// it knows that a module announced a despatch against its order lines with
// some tracking, not that purchasing exists, and the payload is restated here
// as plain values so nothing imports the announcer. On a site without the
// announcer this is never called.
//
// What happens depends on the shop's own setting, despatchFromSupplierTracking:
//
//   off             - nothing.
//   record          - the parcel goes on the order marked QUIET (migration
//                     068): nobody is emailed now, nor by anything that follows
//                     from the parcel - the tracking check's window and failed
//                     delivery emails, the completion email when it lands -
//                     until the owner sends its dispatch note by hand.
//   record-and-tell - the same, plus the emails a parcel recorded by hand gets.
//
// And on what the order already has:
//
//   - a parcel with this tracking already: nothing, beyond a new delivery day or
//     window, which follows the order screen's own rules for telling anybody;
//   - a parcel for these lines that went out with NO tracking (the owner
//     dispatched it by hand and left the number blank, which is common): the
//     tracking is filled in, and in record-and-tell the customer gets the
//     "here is your tracking" email the order screen would send;
//     If the blank parcel held only some of the lines announced, the rest go
//     on the order as a parcel of their own with the same tracking;
//   - otherwise a new parcel for those lines, carrying the tracking, the status
//     following as it does from the order screen, and in record-and-tell the
//     dispatch note (createShipment itself sends nothing).
//
// Only a NEW announcement fills a parcel, makes one or adds lines. Later news
// about the same despatch ('update') changes the day, window and nothing else,
// on the parcel already carrying its tracking: by then the order is the
// owner's, and a line they held back or a parcel they deleted stays that way.
//
// A link is kept only when it goes to a carrier this shop knows
// (lib/tracking/known-carrier-hosts.ts); otherwise the parcel keeps its number
// and goes without it. The announcer read it out of an email, and an email can
// come from anybody.
//
// And it refuses - logs and does nothing - when the order is cancelled or
// refunded, or when everything in the announcement is already dispatched
// under OTHER tracking: tracking already on an order is never overwritten.
//
// Idempotent under two announcements arriving at once: a new parcel is made
// under the order's dispatch lock with a check for this tracking inside it, a
// blank parcel is filled only while it is still blank, and every email is
// claimed before it is sent. A loser re-reads the order and finds the winner's
// parcel.
//
// Returns quietly for a PERMANENT refusal (switched off, not shop's order, a
// cancelled or refunded order, lines already gone under other tracking) and
// THROWS for a passing one (the order stayed busy, the database blinked). The
// announcer logs a throw, keeps the despatch pending and tells us again on its
// next run; a quiet return is taken as done.

/** The announcement, restated. Structural: the announcer may send more. */
export type DespatchRecordedEvent = {
  despatchId: string
  change: 'new' | 'update'
  purchaseOrderNumber: string
  source: { module: string; orderId: string } | null
  lines: Array<{ sourceOrderItemId: string; qty: number }>
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  trackingShortCode?: string | null
  deliveryDate: string | null
  deliverySlot: [string, string] | null
}

/** What was done, for the log and the tests. */
export type DespatchObserved =
  | 'off'
  | 'not-ours'
  | 'refused'
  | 'same'
  | 'updated'
  | 'filled'
  | 'created'

/** The tracking as this shop keeps it. */
export type ShopTracking = {
  trackingNumber: string | null
  trackingUrl: string | null
  trackingShortCode: string | null
  carrier: string | null
  courierId: string | null
}

const LOG = '[shop] despatch from supplier tracking'

function compactNumber(value: string | null | undefined): string {
  return (value ?? '').replace(/[\s-]/g, '').toUpperCase()
}

/**
 * The announced tracking in this shop's own terms: which of its couriers it
 * is, and the link and code that courier keeps. Pure.
 *
 * The courier is the one whose name the announcement gives, or failing that
 * the one courier the link belongs to (the shop's DPD courier for a DPD
 * follow-my-parcel link, its Multidrop courier for a Multidrop link). A DPD
 * courier keeps only the follow-my-parcel link, stored with its code, exactly
 * as the order screen stores it; with no such link the parcel is not put on
 * the DPD courier at all, rather than saved with a link its tracking check
 * would never read.
 */
export function shopTrackingFor(config: Pick<ShpConfig, 'deliveryCouriers'>, event: DespatchRecordedEvent): ShopTracking {
  // Only a link to a carrier this shop knows: the announcement read it out of
  // an email, and an email can come from anybody. Otherwise the parcel keeps
  // its number and goes without the link.
  const safe = safeTrackingUrl(event.trackingUrl) || null
  const url = isKnownCarrierLink(safe) ? safe : null
  const dpdCode = dpdFollowLinkCode(url) ?? (url && /dpd(local)?\.co\.uk\/d\//i.test(url) ? event.trackingShortCode ?? null : null)
  const name = (event.carrier ?? '').trim().toLowerCase()

  const byName = name ? config.deliveryCouriers.filter((c) => c.name.trim().toLowerCase() === name) : []
  const source = dpdCode ? 'dpd' : isMultidropUrl(url) ? 'multidrop' : null
  const bySource = source ? config.deliveryCouriers.filter((c) => c.trackingSource === source) : []
  let courier = byName.length === 1 ? byName[0]! : bySource.length === 1 ? bySource[0]! : null

  if (courier && courierTakesDpdLink(config, courier.id)) {
    if (dpdCode) {
      return {
        trackingNumber: event.trackingNumber,
        trackingUrl: dpdFollowLink(dpdCode),
        trackingShortCode: dpdCode,
        carrier: courier.name,
        courierId: courier.id,
      }
    }
    courier = null
  }
  return {
    trackingNumber: event.trackingNumber,
    trackingUrl: url,
    trackingShortCode: null,
    carrier: courier?.name ?? event.carrier ?? null,
    courierId: courier?.id ?? null,
  }
}

/** Whether a parcel already carries this tracking. */
export function carriesTracking(
  shipment: Pick<ShpShipmentWithItems, 'trackingNumber' | 'trackingUrl' | 'trackingShortCode'>,
  tracking: Pick<ShopTracking, 'trackingNumber' | 'trackingUrl' | 'trackingShortCode'>,
): boolean {
  const number = compactNumber(tracking.trackingNumber)
  if (number && compactNumber(shipment.trackingNumber) === number) return true
  if (tracking.trackingShortCode && shipment.trackingShortCode === tracking.trackingShortCode) return true
  if (tracking.trackingUrl && shipment.trackingUrl === tracking.trackingUrl) return true
  return false
}

/** The announced day and window, only where they are real values. */
function deliveryFrom(event: DespatchRecordedEvent): { date: string | null; slot: [string, string] | null } {
  const date = isDeliveryDate(event.deliveryDate) ? event.deliveryDate : null
  const slot = event.deliverySlot
    && isSlotTime(event.deliverySlot[0]) && isSlotTime(event.deliverySlot[1])
    && slotMinutes(event.deliverySlot[0]) < slotMinutes(event.deliverySlot[1])
    ? event.deliverySlot
    : null
  return { date, slot }
}

/** A new day or window on a parcel already on the order, through the order
 *  screen's own rules for telling the customer - and only in record-and-tell. */
async function updateDelivery(
  orderId: string,
  before: ShpShipmentWithItems,
  event: DespatchRecordedEvent,
  tell: boolean,
): Promise<boolean> {
  const { date, slot } = deliveryFrom(event)
  const patch: { deliveryDate?: string; deliverySlotStart?: string; deliverySlotEnd?: string } = {}
  if (date && date !== before.deliveryDate) patch.deliveryDate = date
  if (slot && (slot[0] !== before.deliverySlotStart || slot[1] !== before.deliverySlotEnd)) {
    patch.deliverySlotStart = slot[0]
    patch.deliverySlotEnd = slot[1]
  }
  if (Object.keys(patch).length === 0) return false
  const after = await updateShipmentDetails(before.id, orderId, patch)
  if (!after || !tell) return Boolean(after)
  await maybeSendSlotEmail(orderId, after, true)
  await maybeSendDayEmail(orderId, before, after, true)
  return true
}

type Attempt = DespatchObserved | 'again'

async function attempt(
  orderId: string,
  statusBefore: Parameters<typeof followDispatchWithStatus>[1],
  event: DespatchRecordedEvent,
  tracking: ShopTracking,
  tell: boolean,
): Promise<Attempt> {
  const shipments = await getShipmentsForOrder(orderId)
  const itemIds = new Set(event.lines.map((line) => line.sourceOrderItemId))
  const hasTracking = hasFollowableTracking(tracking)

  // This tracking is on the order already: at most a new day or window - and,
  // for a NEW announcement only, whatever an earlier run of it got part way
  // through (see completeAfterEarlierRun). An announcement that has not yet
  // gone through comes again as 'new': purchasing marks it announced only
  // once every observer has taken it.
  const same = hasTracking ? shipments.find((s) => carriesTracking(s, tracking)) : undefined
  if (same) {
    const updated = await updateDelivery(orderId, same, event, tell)
    if (event.change === 'new') await completeAfterEarlierRun(orderId, statusBefore, event, tracking, tell)
    return updated ? 'updated' : 'same'
  }

  // A day or window with no tracking: the order's one parcel for these lines.
  if (!hasTracking) {
    const covering = shipments.filter((s) => s.items.some((i) => itemIds.has(i.orderItemId)))
    if (covering.length !== 1) return 'same'
    return (await updateDelivery(orderId, covering[0]!, event, tell)) ? 'updated' : 'same'
  }

  // Later news ('update': a new day, a slot, a better link) only ever touches
  // the parcel already carrying this tracking (or, with no tracking, the
  // order's one parcel for those lines, above). It never fills a parcel, makes
  // one or adds lines: what the order holds by then is the owner's - a line
  // held back stays held back, and a parcel they deleted stays deleted.
  if (event.change !== 'new') return 'same'

  // A parcel for these lines that went out with no tracking: fill it in. In
  // "record" it becomes quiet, like a parcel this records itself.
  const blank = shipments.find((s) => !hasFollowableTracking(s) && s.items.some((i) => itemIds.has(i.orderItemId)))
  if (blank) {
    const filled = await fillBlankShipmentTracking(blank.id, orderId, tracking, !tell)
    // Somebody else filled it between the read and the write: look again.
    if (!filled) return 'again'
    const after = (await getShipmentsForOrder(orderId)).find((s) => s.id === blank.id)
    if (after) {
      if (tell) await maybeSendTrackingEmail(orderId, blank, after, true)
      await updateDelivery(orderId, after, event, tell)
    }
    // The blank parcel held only some of what was announced: the rest went in
    // the same parcel as far as the supplier is concerned, so it goes on the
    // order too, with the same tracking.
    await recordRest(orderId, statusBefore, event, tracking, tell)
    return 'filled'
  }

  // A new parcel, for what is still to go out of the lines announced.
  return recordParcel(orderId, statusBefore, event, tracking, tell, true)
}

/**
 * The announced lines that are not on a parcel carrying this tracking and are
 * still to go out, put on the order as a parcel of their own with it.
 *
 * Read fresh, so it is right whether this run filled the blank parcel a
 * moment ago or an earlier run did and then failed: a retry finds the tracking
 * on the order and finishes the job rather than stopping at "same". Two runs
 * at once cannot both record it - createShipment caps every line under the
 * order's lock, so the second finds nothing left to send. A busy order throws
 * DespatchNotYetRecorded, so the announcer keeps the despatch and tells us
 * again rather than calling it done with lines missing.
 */
async function recordRest(
  orderId: string,
  statusBefore: Parameters<typeof followDispatchWithStatus>[1],
  event: DespatchRecordedEvent,
  tracking: ShopTracking,
  tell: boolean,
): Promise<void> {
  const tracked = new Set(
    (await getShipmentsForOrder(orderId))
      .filter((s) => carriesTracking(s, tracking))
      .flatMap((s) => s.items.map((i) => i.orderItemId)),
  )
  const rest = event.lines.filter((line) => !tracked.has(line.sourceOrderItemId))
  if (rest.length === 0) return
  const outcome = await recordParcel(orderId, statusBefore, { ...event, lines: rest }, tracking, tell, false)
  if (outcome === 'again') {
    throw new DespatchNotYetRecorded(`order ${orderId} was busy, so the rest of ${event.purchaseOrderNumber}'s despatch has not been put on it yet`)
  }
}

/**
 * What a run that stopped part way may have left undone, finished: the rest
 * of the lines (recordRest), and the order's status following its parcels.
 * Both are idempotent - nothing is recorded twice and the status only moves
 * when it has not already - and no email is sent from here, so nothing goes
 * twice either.
 */
async function completeAfterEarlierRun(
  orderId: string,
  statusBefore: Parameters<typeof followDispatchWithStatus>[1],
  event: DespatchRecordedEvent,
  tracking: ShopTracking,
  tell: boolean,
): Promise<void> {
  await recordRest(orderId, statusBefore, event, tracking, tell)
  await followDispatchWithStatus(orderId, statusBefore, 'recorded')
}

/** A new parcel for whatever of the announced lines is still to go out. With
 *  `guard`, refused under the order's lock when this tracking is already on
 *  the order (a concurrent announcement got there first). */
async function recordParcel(
  orderId: string,
  statusBefore: Parameters<typeof followDispatchWithStatus>[1],
  event: DespatchRecordedEvent,
  tracking: ShopTracking,
  tell: boolean,
  guard: boolean,
): Promise<Attempt> {
  const summary = await getOrderDispatchSummary(orderId)
  const outstanding = new Map(summary.lines.map((line) => [line.orderItemId, line.outstandingQty]))
  const items = event.lines
    .map((line) => ({
      orderItemId: line.sourceOrderItemId,
      quantity: Math.min(Math.max(0, Math.trunc(line.qty)), outstanding.get(line.sourceOrderItemId) ?? 0),
    }))
    .filter((item) => item.quantity > 0)
  if (items.length === 0) {
    if (guard) {
      // Nothing left to send - but a concurrent announcement may have just
      // sent it with THIS tracking, between this run's first look and now.
      // Then it is news about a parcel already there: look again.
      if ((await getShipmentsForOrder(orderId)).some((s) => carriesTracking(s, tracking))) return 'again'
      console.warn(`${LOG}: ${event.purchaseOrderNumber}'s lines on order ${orderId} are already dispatched under other tracking, so it has been left alone.`)
      return 'refused'
    }
    return 'filled'
  }

  const { date, slot } = deliveryFrom(event)
  const created = await createShipment({
    orderId,
    items,
    trackingNumber: tracking.trackingNumber,
    trackingUrl: tracking.trackingUrl,
    trackingShortCode: tracking.trackingShortCode,
    carrier: tracking.carrier,
    courierId: tracking.courierId,
    deliveryDate: date,
    deliverySlotStart: slot?.[0] ?? null,
    deliverySlotEnd: slot?.[1] ?? null,
    notes: `Recorded from the supplier's delivery tracking (${event.purchaseOrderNumber}).`,
    ...(guard ? { unlessTrackingOnOrder: tracking } : {}),
    // "record": nothing that can follow from this parcel emails the customer -
    // not the tracking check, not a failed delivery, not the completion.
    quietCustomerEmails: !tell,
  })
  if (!created.ok) {
    if (created.code === 'busy' || created.code === 'duplicate') return 'again'
    console.warn(`${LOG}: could not record a parcel on order ${orderId}: ${created.error}`)
    return 'refused'
  }

  // The dispatch note first, then the status: the note is the one thing a
  // retry cannot tell it has already sent, and the status is the one thing a
  // retry puts right (completeAfterEarlierRun).
  if (tell) {
    try {
      await sendShipmentDispatchedEmail({ orderId, shipmentId: created.shipment.id })
    } catch (error) {
      console.error(`${LOG}: dispatch email failed`, error)
    }
  }
  await followDispatchWithStatus(orderId, statusBefore, 'recorded')
  return 'created'
}

// Few and short: this runs inside the inbox's five seconds for the email, and a
// busy order is busy for milliseconds. A run that gives up loses nothing - the
// announcement comes again with the next offer of the email.
const RETRIES = 3

/** Put an announced despatch on the customer's order, as the shop's setting
 *  says. Returns what it did. */
export async function observeDespatchRecorded(
  event: DespatchRecordedEvent,
  options: { pauseMs?: number } = {},
): Promise<DespatchObserved> {
  try {
    if (event.source?.module !== 'shop' || !event.source.orderId) return 'not-ours'
    const config = await getShopConfigCached()
    const mode = config.despatchFromSupplierTracking
    if (mode === 'off') return 'off'
    const tell = mode === 'record-and-tell'

    const orderId = event.source.orderId
    const order = await getOrderById(orderId)
    if (!order) return 'not-ours'
    if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
      console.warn(`${LOG}: order ${order.orderNumber} is ${order.status.toLowerCase()}, so ${event.purchaseOrderNumber}'s despatch has not been put on it.`)
      return 'refused'
    }

    const tracking = shopTrackingFor(config, event)
    const pause = options.pauseMs ?? 25
    for (let round = 0; round < RETRIES; round++) {
      const outcome = await attempt(orderId, order.status, event, tracking, tell)
      if (outcome !== 'again') return outcome
      await new Promise((resolve) => setTimeout(resolve, pause * (round + 1)))
    }
    throw new DespatchNotYetRecorded(`order ${order.orderNumber} stayed busy, so ${event.purchaseOrderNumber}'s despatch has not been put on it yet`)
  } catch (error) {
    console.error(`${LOG}: failed for ${event.purchaseOrderNumber}, to be tried again`, error)
    throw error
  }
}

/** A passing failure: the announcer tries again later. */
export class DespatchNotYetRecorded extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DespatchNotYetRecorded'
  }
}

/** What the manifest entry names. */
export const shopDespatchRecordedObserver = (event: DespatchRecordedEvent): Promise<DespatchObserved> =>
  observeDespatchRecorded(event)
