import { dpdShortCodeFromUrl } from '@/modules/shop/lib/tracking/dpd'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById, getOrderItems, outstandingPreOrderItems } from '@/modules/shop/lib/db/orders'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import {
  claimSlotNotification,
  createShipment,
  deleteShipment,
  getOrderDispatchSummary,
  getShipmentsForOrder,
  updateShipmentDetails,
} from '@/modules/shop/lib/db/shipments'
import { sendShipmentDispatchedEmail } from '@/modules/shop/lib/shipment-email'
import { sendDeliverySlotEmail } from '@/modules/shop/lib/delivery-slot-email'
import { isDeliveryDate, isSlotTime, slotMinutes } from '@/modules/shop/lib/delivery-slot'
import type { ShpConfig } from '@/modules/shop/lib/config'
import type { ShpOrderItem, ShpShipmentWithItems } from '@/modules/shop/lib/types'

// A tracking link is offered to the customer as something to click, so only a
// web address is accepted: anything else (a javascript: URL above all) would be
// put in front of a shopper by the dispatch email. Blank comes through as null
// rather than being rejected - most parcels go out without one.
const TrackingUrl = z
  .string()
  .trim()
  .refine((value) => {
    try {
      const parsed = new URL(value)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }, 'The tracking link has to be a web address starting with http:// or https://')

// The delivery day, and the window on it, exactly as the database stores them:
// 'YYYY-MM-DD' and 'HH:MM'. Never a Date - see lib/delivery-slot.ts for what
// turning a delivery day into an instant does to the day it prints as.
const DeliveryDate = z.string().trim().refine(isDeliveryDate, 'That is not a real date.')
const SlotTime = z.string().trim().refine(isSlotTime, 'A delivery time looks like 10:00.')

/**
 * A courier's follow-my-parcel link, reduced to the code inside it.
 *
 * Accepted as the whole address or as the bare code, because an owner pasting
 * out of an email will do either, and stored as the code: the address around it
 * is the courier's to restructure, and a stored URL would be one redesign away
 * from being a link to nowhere. Anything that is neither is rejected here
 * rather than saved and quietly ignored by the poller.
 */
const TrackingShortCode = z.string().trim().transform((value, ctx) => {
  if (!value) return null
  const code = dpdShortCodeFromUrl(value)
  if (!code) {
    ctx.addIssue({ code: 'custom', message: 'That does not look like a follow-my-parcel link.' })
    return z.NEVER
  }
  return code
})

const DeliveryFields = {
  /** The courier picked from the shop's own list. Its name is read from
   *  settings server-side rather than taken from the browser, so a renamed
   *  courier renames itself on parcels recorded afterwards and nobody can post
   *  a parcel from "Royal Mail" that was nothing of the sort. */
  courierId: z.string().max(64).nullable().optional(),
  /** Only used when no courierId was picked - the "Other" case. */
  carrier: z.string().max(80).nullable().optional(),
  deliveryDate: DeliveryDate.nullable().optional(),
  deliverySlotStart: SlotTime.nullable().optional(),
  deliverySlotEnd: SlotTime.nullable().optional(),
}

const Body = z.object({
  items: z.array(z.object({ orderItemId: z.string(), quantity: z.number().int().min(1) })).min(1),
  trackingNumber: z.string().nullable().optional(),
  trackingUrl: TrackingUrl.nullable().optional(),
  trackingShortCode: TrackingShortCode.nullable().optional(),
  ...DeliveryFields,
  notes: z.string().nullable().optional(),
  // Owners back-date a parcel that went out on Friday and is only being
  // recorded on Monday, so a plain date string from the admin is accepted and
  // coerced here rather than being rejected as "not an ISO timestamp".
  shippedAt: z.coerce.date().nullable().optional(),
  emailCustomer: z.boolean().optional(),
})

type CourierChoice = { courierId: string | null; carrier: string | null }

// Which courier this parcel went with, decided here rather than trusted.
//
// A picked courier's NAME comes off the shop's settings, not off the request:
// the browser sends an id, and the name printed on the customer's order page is
// whatever that id is called today. The free-text name is only honoured when no
// courier was picked, which is the "Other" case the dropdown offers.
function resolveCourier(
  config: Pick<ShpConfig, 'deliveryCouriers'>,
  courierId: string | null | undefined,
  carrier: string | null | undefined,
): { ok: true; choice: CourierChoice } | { ok: false; error: string } {
  const id = courierId?.trim() || null
  if (!id) return { ok: true, choice: { courierId: null, carrier: carrier?.trim() || null } }

  const courier = config.deliveryCouriers.find((c) => c.id === id)
  if (!courier) return { ok: false, error: 'That courier is no longer in your list. Pick another one.' }
  return { ok: true, choice: { courierId: courier.id, carrier: courier.name } }
}

/** Both ends of a window, or neither, and the second one after the first.
 *  Half a window tells a customer nothing and puts a van nowhere. */
function checkWindow(start: string | null | undefined, end: string | null | undefined): string | null {
  const hasStart = typeof start === 'string' && start.length > 0
  const hasEnd = typeof end === 'string' && end.length > 0
  if (hasStart !== hasEnd) return 'A delivery window needs both a start and an end time.'
  if (hasStart && hasEnd && slotMinutes(start) >= slotMinutes(end)) {
    return 'The delivery window has to end after it starts.'
  }
  return null
}

// The hold rule itself lives in lib/db/orders.ts. Here it is read-only: this
// route only EXPLAINS the hold to the owner, while the status route ENFORCES it.
// Both must give the same answer, which is why neither keeps its own copy.

// Everything the order screen needs to show dispatch progress in one call: the
// per-line summary, the shipments already recorded, and whether the shop's
// hold-everything pre-order policy currently applies to this order. It rides on
// this route rather than the main order GET so the dispatch block can refresh
// itself after a dispatch without re-fetching the whole order.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders', { allowAccess: true })
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const [summary, shipments, config, items] = await Promise.all([
    getOrderDispatchSummary(id),
    getShipmentsForOrder(id),
    getShopConfigCached(),
    getOrderItems(id),
  ])

  const holdAll = config.preOrderMixedCartBehaviour === 'HOLD_ALL'
  const outstanding = holdAll ? await outstandingPreOrderItems(items) : []
  // The whole order waits on the last item to arrive, so the latest known date
  // is the one worth naming.
  const expectedDate = outstanding
    .map((i) => i.preOrderDispatchDate)
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime())[0]

  return NextResponse.json({
    summary,
    shipments,
    // The dispatch modal's courier list. It rides on this call rather than
    // being fetched separately because every screen that offers dispatch is
    // already waiting on this one, and a second round trip for six words would
    // show up as a dropdown that populates a beat late.
    couriers: config.deliveryCouriers.map((c) => ({ id: c.id, name: c.name })),
    preOrderHold: {
      active: holdAll && outstanding.length > 0,
      outstandingCount: outstanding.length,
      expectedDate: expectedDate ? expectedDate.toISOString() : null,
    },
  })
}

// PROTECTED - records one dispatch of a subset of an order's lines.
//
// Every cap (nothing dispatched twice, nothing dispatched that has since been
// refunded) is policed inside createShipment, under the same advisory lock
// refunds take, so a refund landing mid-request cannot slip past the checks.
// Its rejections already read as plain English for a shop owner, so they are
// handed back verbatim rather than being re-worded or re-derived here.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid dispatch' }, { status: 400 })

  const windowError = checkWindow(parsed.data.deliverySlotStart, parsed.data.deliverySlotEnd)
  if (windowError) return NextResponse.json({ error: windowError }, { status: 400 })

  const courier = resolveCourier(await getShopConfigCached(), parsed.data.courierId, parsed.data.carrier)
  if (!courier.ok) return NextResponse.json({ error: courier.error }, { status: 400 })

  const outcome = await createShipment({
    orderId: id,
    shippedAt: parsed.data.shippedAt ?? null,
    trackingNumber: parsed.data.trackingNumber ?? null,
    trackingUrl: parsed.data.trackingUrl ?? null,
    trackingShortCode: parsed.data.trackingShortCode ?? null,
    carrier: courier.choice.carrier,
    courierId: courier.choice.courierId,
    deliveryDate: parsed.data.deliveryDate ?? null,
    deliverySlotStart: parsed.data.deliverySlotStart ?? null,
    deliverySlotEnd: parsed.data.deliverySlotEnd ?? null,
    notes: parsed.data.notes ?? null,
    items: parsed.data.items,
  })

  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })

  // The parcel is out and the shipment is recorded whatever the mail server
  // thinks. A bounced send must not roll that back or report a failure the
  // owner would act on by dispatching all over again, so it is logged and
  // stepped over - the same treatment a status-change email gets.
  if (parsed.data.emailCustomer) {
    try {
      await sendShipmentDispatchedEmail({ orderId: id, shipmentId: outcome.shipment.id })
    } catch (error) {
      console.error('[shop] dispatch email failed', error)
    }
  }

  return NextResponse.json({ shipment: outcome.shipment }, { status: 201 })
}

// PROTECTED - fills in, or corrects, the details of a parcel already recorded.
//
// This exists because a courier books a delivery in two instalments. The day
// comes when the parcel is collected, which is when dispatch is recorded; the
// four-hour window comes the evening before it arrives, by which time there is
// nothing left to dispatch. Recording a second parcel for it would tell the
// customer their order had been split in two, which it has not been.
//
// Quantities are deliberately out of reach: what is in the parcel is what every
// cap in createShipment polices, and it changes by undoing the dispatch and
// recording it again, under the lock, with all the arithmetic re-checked.
const PatchBody = z.object({
  shipmentId: z.string().min(1),
  trackingNumber: z.string().nullable().optional(),
  trackingUrl: TrackingUrl.nullable().optional(),
  trackingShortCode: TrackingShortCode.nullable().optional(),
  ...DeliveryFields,
  notes: z.string().nullable().optional(),
  /** Whether saving a newly-confirmed window emails the customer about it.
   *  Defaults to on: a window nobody was told about is a window nobody can
   *  plan around. Sent at most once per parcel - see claimSlotNotification. */
  emailCustomer: z.boolean().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const parsed = PatchBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid parcel details' }, { status: 400 })
  }

  const { shipmentId, emailCustomer, courierId, carrier, ...rest } = parsed.data

  // Read the window as it will be AFTER the save, not as it was sent: an edit
  // that only clears the end time would otherwise pass a check that never saw
  // the start time still sitting in the row.
  const existing = (await getShipmentsForOrder(id)).find((s) => s.id === shipmentId)
  if (!existing) return NextResponse.json({ error: 'That parcel is no longer on this order.' }, { status: 404 })

  const nextStart = rest.deliverySlotStart !== undefined ? rest.deliverySlotStart : existing.deliverySlotStart
  const nextEnd = rest.deliverySlotEnd !== undefined ? rest.deliverySlotEnd : existing.deliverySlotEnd
  const windowError = checkWindow(nextStart, nextEnd)
  if (windowError) return NextResponse.json({ error: windowError }, { status: 400 })

  const config = await getShopConfigCached()
  const courier = courierId !== undefined || carrier !== undefined
    ? resolveCourier(config, courierId, carrier)
    : null
  if (courier && !courier.ok) return NextResponse.json({ error: courier.error }, { status: 400 })

  const shipment = await updateShipmentDetails(shipmentId, id, {
    ...rest,
    ...(courier?.ok ? { courierId: courier.choice.courierId, carrier: courier.choice.carrier } : {}),
  })
  if (!shipment) return NextResponse.json({ error: 'That parcel is no longer on this order.' }, { status: 404 })

  const notified = await maybeSendSlotEmail(id, shipment, emailCustomer !== false)
  return NextResponse.json({ shipment, slotEmailSent: notified })
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
async function maybeSendSlotEmail(
  orderId: string,
  shipment: ShpShipmentWithItems,
  wanted: boolean,
): Promise<boolean> {
  if (!wanted) return false
  if (!shipment.deliveryDate || !shipment.deliverySlotStart || !shipment.deliverySlotEnd) return false
  if (shipment.slotNotifiedAt) return false
  if (!(await claimSlotNotification(shipment.id, orderId))) return false

  try {
    await sendDeliverySlotEmail({ orderId, shipmentId: shipment.id })
  } catch (error) {
    console.error('[shop] delivery slot email failed', error)
  }
  return true
}

// Undo a dispatch recorded by mistake. The dispatched totals are summed from
// the shipment's lines rather than held in a counter, so deleting the shipment
// is all it takes for the units to go back to outstanding.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const shipmentId = request.nextUrl.searchParams.get('shipmentId')
  if (!shipmentId) return NextResponse.json({ error: 'No dispatch was named to undo.' }, { status: 400 })

  // Scoped to this order, so a shipment id from elsewhere cannot be deleted
  // through an order the caller happens to be allowed to see.
  const deleted = await deleteShipment(shipmentId, id)
  if (!deleted) return NextResponse.json({ error: 'That dispatch is no longer on this order.' }, { status: 404 })

  return NextResponse.json({ success: true })
}
