import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import {
  allShipmentsDelivered,
  getOrderDispatchSummary,
  listShipmentsForTrackingPoll,
  recordTrackingCheck,
  recordTrackingStage,
} from '@/modules/shop/lib/db/shipments'
import { applyOrderStatusChange } from '@/modules/shop/lib/order-status'
import { courierForShipment } from '@/modules/shop/lib/courier-faqs'
import { courierIsPolled, stageMeaning } from '@/modules/shop/lib/tracking/stage-meaning'
import { furthestStage, isMultidropUrl, parseMultidropStages } from '@/modules/shop/lib/tracking/multidrop'

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

/** At a time. Politeness to the courier, mostly: their tracking page is not a
 *  service anyone is paying for. */
const CONCURRENCY = 3

/** Per request. Long enough for a slow page, short enough that a hung server
 *  cannot hold the whole run open. */
const TIMEOUT_MS = 8000

type Outcome = { checked: number; moved: number; delivered: number; completed: number; failed: number }

async function fetchTrackingPage(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'CactusShopDeliveryTracking/1.0 (+order status)' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    // A timeout, a DNS failure, a courier having an afternoon. Nothing is
    // written except the check timestamp: silence is not evidence of anything,
    // and least of all of a parcel not having arrived.
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return errorResponse('CRON_SECRET is not configured', 503)
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return errorResponse('Unauthorized', 401)

  const config = await getShopConfigCached()

  // The early exit. No courier is set up for polling, so there is nothing this
  // run could learn however many parcels are out.
  if (!config.deliveryCouriers.some(courierIsPolled)) {
    return NextResponse.json({ ok: true, skipped: 'no couriers are set up for tracking' })
  }

  const parcels = await listShipmentsForTrackingPoll(PARCEL_LIMIT)
  if (parcels.length === 0) return NextResponse.json({ ok: true, checked: 0 })

  const outcome: Outcome = { checked: 0, moved: 0, delivered: 0, completed: 0, failed: 0 }
  const ordersToReview = new Set<string>()

  for (let i = 0; i < parcels.length; i += CONCURRENCY) {
    await Promise.all(parcels.slice(i, i + CONCURRENCY).map(async (parcel) => {
      const courier = courierForShipment(config, parcel)
      // A parcel whose courier is not polled, or whose link is not one this can
      // read, is stamped as checked and left alone - otherwise it sits at the
      // front of the queue for ever, being skipped.
      if (!courierIsPolled(courier) || !isMultidropUrl(parcel.trackingUrl)) {
        await recordTrackingCheck(parcel.id)
        return
      }

      const html = await fetchTrackingPage(parcel.trackingUrl as string)
      if (!html) {
        outcome.failed += 1
        await recordTrackingCheck(parcel.id)
        return
      }

      const stage = furthestStage(parseMultidropStages(html))
      if (!stage) {
        // The page loaded and said nothing we recognise - a login screen, a
        // redesign, an order they no longer hold. Recorded as looked-at, and
        // nothing is concluded from it.
        outcome.failed += 1
        await recordTrackingCheck(parcel.id)
        return
      }

      outcome.checked += 1
      const meaning = stageMeaning(courier, stage.label)
      const delivered = meaning === 'delivered'
      if (stage.label !== parcel.trackingStage) outcome.moved += 1
      if (delivered && !parcel.deliveredAt) {
        outcome.delivered += 1
        ordersToReview.add(parcel.orderId)
      }

      await recordTrackingStage(parcel.id, { stage: stage.label, delivered })
    }))
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
