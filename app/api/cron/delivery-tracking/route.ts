import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import {
  allShipmentsDelivered,
  getOrderDispatchSummary,
  listOrdersAwaitingCompletion,
  listShipmentsForTrackingPoll,
  recordCarrierReading,
  recordReceipt,
  recordSignature,
  recordTrackingCheck,
  recordTrackingPageDetails,
  recordTrackingStage,
} from '@/modules/shop/lib/db/shipments'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { getSiteTimezone } from '@/lib/config/timezone.server'
import { applyOrderStatusChange } from '@/modules/shop/lib/order-status'
import { courierForShipment } from '@/modules/shop/lib/courier-faqs'
import { courierIsPolled, stageMeaning } from '@/modules/shop/lib/tracking/stage-meaning'
import { readParcelTracking } from '@/modules/shop/lib/tracking/read-parcel'
import { parseSignature } from '@/modules/shop/lib/tracking/multidrop-page'
import { captureSignature } from '@/modules/shop/lib/tracking/signature-capture'

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
      if (!courierIsPolled(courier)) {
        await recordTrackingCheck(parcel.id)
        return
      }

      // Which courier this is, and therefore which shape of request, is the
      // reader's business. What comes back is the same either way.
      const reading = courier ? await readParcelTracking(courier, parcel, timezone) : null
      if (!reading?.stage) {
        // The request failed, or the page loaded and said nothing this reader
        // recognised - a login screen, a redesign, an order they no longer
        // hold. Recorded as looked-at, and nothing is concluded from it.
        outcome.failed += 1
        await recordTrackingCheck(parcel.id)
        return
      }

      outcome.checked += 1
      const stage = reading.stage
      const meaning = stageMeaning(courier, stage)
      // The courier's own flag where they give one, and the owner's reading of
      // their words where they do not. A boolean from the carrier is better
      // evidence than a sentence somebody matched, and it is the only half of
      // this that cannot be defeated by a courier rewording their scans.
      const delivered = reading.delivered ?? meaning === 'delivered'
      if (stage !== parcel.trackingStage) outcome.moved += 1
      if (delivered && !parcel.deliveredAt) {
        outcome.delivered += 1
        ordersToReview.add(parcel.orderId)
      }

      await recordTrackingStage(parcel.id, { stage, delivered })

      // The rest of what the same request already cost: the history, the window
      // the van is working to today, and where this parcel sits on the round.
      await recordCarrierReading(parcel.id, {
        events: reading.events,
        windowFrom: reading.windowFrom,
        windowTo: reading.windowTo,
        stopNumber: reading.stopNumber,
        stopsCompleted: reading.stopsCompleted,
        stopsTotal: reading.stopsTotal,
        minutesToStop: reading.minutesToStop,
        driverName: reading.driverName,
        outForDelivery: reading.outForDelivery,
      })

      // The ids the live map asks with, where the courier gives any. Written
      // separately from the reading above because they PERSIST: they identify
      // the round, and a poll that could not see one must not wipe the one we
      // already had.
      await recordTrackingPageDetails(parcel.id, {
        clientId: reading.clientId,
        routeId: reading.routeId,
        crewLine: reading.crewLine,
        dropsAway: reading.dropsAway,
        destinationLat: reading.destinationLat,
        destinationLng: reading.destinationLng,
      })

      // Proof of delivery in words, where the courier gives one. Written
      // before the picture is attempted, because it is the half that always
      // arrives: some carriers hand over a name and a time to anybody and keep
      // the photograph behind a login nobody can automate.
      if (reading.receivedBy) {
        await recordReceipt(parcel.id, { receivedBy: reading.receivedBy, receivedAt: reading.receivedAt })
      }

      // Proof of delivery, taken once and only once - see recordSignature for
      // why the guard is in the WHERE clause as well as here. Everything about
      // it is allowed to fail quietly: the parcel has still been delivered, and
      // an argument about a missing picture is a better one to have than an
      // order stuck open because a bucket was busy.
      //
      // Whether that picture is a signature scrawled on a handset or a
      // photograph of a box on a doorstep is the courier's business, not this
      // route's. Multidrop gives the first, DPD the second, and both are
      // stored the same way and shown in the same place.
      if (delivered && !parcel.signatureUrl) {
        const order = await getOrderById(parcel.orderId)
        const reference = order?.orderNumber ?? parcel.id
        const signature = reading.multidropHtml ? parseSignature(reading.multidropHtml, timezone) : null

        const stored = signature?.imageUrl
          ? await captureSignature(signature.imageUrl, reference, { orderNumber: order?.orderNumber })
          : reading.proofImage
            ? await captureSignature(reading.proofImage.url, reference, {
                headers: reading.proofImage.headers,
                label: 'delivery-photo',
                orderNumber: order?.orderNumber,
              })
            : null

        if (stored) {
          await recordSignature(parcel.id, {
            // The name off the courier's own page where they printed one, and
            // the name they gave in the payload otherwise - a photograph comes
            // with "received by BECKLEY" rather than with a scrawl.
            signedBy: signature?.signedBy ?? reading.receivedBy,
            signedAt: signature?.signedAt ?? reading.receivedAt,
            url: stored.url,
            key: stored.key,
          })
          outcome.signatures += 1
        }
      }
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
