import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import {
  allShipmentsDelivered,
  getOrderDispatchSummary,
  listOrdersAwaitingCompletion,
  listShipmentsForTrackingPoll,
  recordTrackingCheck,
} from '@/modules/shop/lib/db/shipments'
import { getSiteTimezone } from '@/lib/config/timezone.server'
import { applyOrderStatusChange } from '@/modules/shop/lib/order-status'
import { courierForShipment } from '@/modules/shop/lib/courier-faqs'
import { courierIsPolled } from '@/modules/shop/lib/tracking/stage-meaning'
import { readParcelTracking } from '@/modules/shop/lib/tracking/read-parcel'
import { storeParcelReading } from '@/modules/shop/lib/tracking/store-reading'

// Hourly (manifest cronJobs). Asks each live parcel's courier where it has got
// to, and finishes an order off when every parcel on it has arrived.
//
// WHY A SCHEDULE RATHER THAN ON PAGE VIEW
//
// The customer's order page must not depend on a third party being up, must not
// cost a foreign round trip to render, and must not send the customer - or their
// address bar - anywhere near a page carrying the shop's trade account details.
// So the shop reads it here, on its own clock, and the page reads what was
// stored.
//
// CHEAP WHEN THERE IS NOTHING TO DO
//
// A cron entry cannot be conditional, so this one earns its keep by leaving
// early: one indexed query that returns no rows, and the run is over. On a shop
// with nothing out, that is the entire cost of having the feature.
//
// AND CAPPED WHEN THERE IS
//
// PARCEL_LIMIT parcels a run, oldest-checked first, a few at a time. A shop with
// two hundred deliveries out does not get two hundred simultaneous requests to
// somebody else's server, and the ordering means the backlog rotates rather than
// starving.

/** Most parcels asked about in one run. Twenty-five an hour clears a very busy
 *  week comfortably, and keeps the run well inside a scheduled function's
 *  budget even when every request has to time out. */
const PARCEL_LIMIT = 25

/** Leftover orders looked at per run. Small on purpose: it is a tidy-up pass,
 *  and on a healthy shop it returns nothing at all. */
const COMPLETION_SWEEP_LIMIT = 10

/** At a time. Politeness to the courier, mostly: their tracking page is not a
 *  service anyone is paying for. */
const CONCURRENCY = 3

type Outcome = {
  checked: number
  moved: number
  delivered: number
  completed: number
  failed: number
  signatures: number
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return errorResponse('CRON_SECRET is not configured', 503)
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return errorResponse('Unauthorized', 401)

  const [config, timezone] = await Promise.all([getShopConfigCached(), getSiteTimezone()])

  // The early exit. No courier is set up for polling, so there is nothing this
  // run could learn however many parcels are out.
  if (!config.deliveryCouriers.some(courierIsPolled)) {
    return NextResponse.json({ ok: true, skipped: 'no couriers are set up for tracking' })
  }

  const parcels = await listShipmentsForTrackingPoll(PARCEL_LIMIT)
  if (parcels.length === 0) return NextResponse.json({ ok: true, checked: 0 })

  const outcome: Outcome = { checked: 0, moved: 0, delivered: 0, completed: 0, failed: 0, signatures: 0 }
  const ordersToReview = new Set<string>()

  for (let i = 0; i < parcels.length; i += CONCURRENCY) {
    await Promise.all(parcels.slice(i, i + CONCURRENCY).map(async (parcel) => {
      const courier = courierForShipment(config, parcel)
      // A parcel whose courier is not followed is stamped as checked and left
      // alone - otherwise it sits at the front of the queue for ever, being
      // skipped.
      if (!courier || !courierIsPolled(courier)) {
        await recordTrackingCheck(parcel.id)
        return
      }

      // Which courier this is, and therefore which shape of request, is the
      // reader's business. What comes back is the same either way.
      const reading = await readParcelTracking(courier, parcel, timezone)
      if (!reading?.stage) {
        // The request failed, or the page loaded and said nothing this reader
        // recognised - a login screen, a redesign, an order they no longer
        // hold. Recorded as looked-at, and nothing is concluded from it.
        //
        // A parcel still marked out for delivery is left un-stamped on failure:
        // moving its checked time would shove it to the back of the queue and
        // the same hourly run is its only chance to learn it has arrived.
        outcome.failed += 1
        if (!parcel.carrierOutForDelivery) await recordTrackingCheck(parcel.id)
        return
      }

      outcome.checked += 1
      const { delivered, moved, signatureStored } = await storeParcelReading(courier, parcel, reading, timezone)
      if (moved) outcome.moved += 1
      if (delivered && !parcel.deliveredAt) {
        outcome.delivered += 1
        ordersToReview.add(parcel.orderId)
      }
      if (signatureStored) outcome.signatures += 1
    }))
  }

  // Orders whose parcels all arrived at some point but which never got
  // finished off - see listOrdersAwaitingCompletion for how that happens. They
  // go through exactly the same checks as one delivered a minute ago.
  for (const orderId of await listOrdersAwaitingCompletion(COMPLETION_SWEEP_LIMIT)) {
    ordersToReview.add(orderId)
  }

  // Finishing an order off, once every parcel on it has arrived AND there is
  // nothing left owing. Both halves matter: an order with one of three parcels
  // delivered is not complete, and neither is one whose only parcel arrived
  // while two items still sit here waiting for stock.
  //
  // It goes through applyOrderStatusChange rather than writing the status
  // directly, so the completion email, the pre-order stock rules and everything
  // else that hangs off a status change behave exactly as they do when an owner
  // presses the button themselves.
  for (const orderId of ordersToReview) {
    const [summary, everyParcelIn] = await Promise.all([
      getOrderDispatchSummary(orderId),
      allShipmentsDelivered(orderId),
    ])
    if (!everyParcelIn || !summary.fullyDispatched) continue

    const result = await applyOrderStatusChange({ orderId, status: 'COMPLETED', sendEmail: true })
    if (result.ok) outcome.completed += 1
    else console.warn(`[shop] tracking could not complete order ${orderId}: ${result.error}`)
  }

  return NextResponse.json({ ok: true, ...outcome })
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
