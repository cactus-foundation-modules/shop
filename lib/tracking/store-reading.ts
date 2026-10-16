import {
  recordCarrierReading,
  recordConsignment,
  recordReceipt,
  recordSignature,
  recordTrackingPageDetails,
  recordTrackingStage,
  recordVehiclePosition,
} from '@/modules/shop/lib/db/shipments'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { maybeSendCarrierWindowEmail } from '@/modules/shop/lib/delivery-slot-email'
import { maybeAnswerDelayFromCourier } from '@/modules/shop/lib/delivery-delay-email'
import { maybeSendFailedDeliveryEmail } from '@/modules/shop/lib/failed-delivery-email'
import { parseSignature } from '@/modules/shop/lib/tracking/multidrop-page'
import { captureSignature } from '@/modules/shop/lib/tracking/signature-capture'
import { stageMeaning } from '@/modules/shop/lib/tracking/stage-meaning'
import { courierTimesEmailable } from '@/modules/shop/lib/tracking/provisional-window'
import type { ConsignmentReading, ParcelReading } from '@/modules/shop/lib/tracking/read-parcel'
import type { ConsignmentParcel } from '@/modules/shop/lib/consignment-parcels'
import type { ShpCourier } from '@/modules/shop/lib/courier-faqs'
import type { ShpShipment } from '@/modules/shop/lib/types'

/** Write one courier reading to the parcel row, shared by the hourly job and
 *  the page poll that runs while somebody is watching. */
export async function storeParcelReading(
  courier: Pick<ShpCourier, 'outForDeliveryStages' | 'deliveredStages' | 'failedStages'>
    & Partial<Pick<ShpCourier, 'trackingSource'>>,
  parcel: ShpShipment,
  reading: ParcelReading,
  timezone: string,
): Promise<{ delivered: boolean; moved: boolean; signatureStored: boolean }> {
  const stage = reading.stage
  const meaning = stageMeaning(courier, stage)
  const delivered = reading.delivered ?? meaning === 'delivered'
  const moved = stage !== parcel.trackingStage

  await recordTrackingStage(parcel.id, { stage, delivered })

  // A failed attempt, told to the customer once. After the stage is written,
  // because writing a NEW stage is what clears the previous attempt's claim -
  // the other way round, a second failure would find the first one's stamp
  // still there and send nothing.
  if (meaning === 'failed' && !delivered) {
    await maybeSendFailedDeliveryEmail(parcel)
  }

  // DPD keep outForDelivery true even after delivery. Once we know it has
  // arrived, stop treating it as on a van.
  await recordCarrierReading(parcel.id, {
    events: reading.events,
    windowFrom: reading.windowFrom,
    windowTo: reading.windowTo,
    // Once it has landed, the round position is yesterday's news. DPD keep
    // stale counts on the row and they read as "on their way to you now".
    stopNumber: delivered ? null : reading.stopNumber,
    stopsCompleted: delivered ? null : reading.stopsCompleted,
    stopsTotal: delivered ? null : reading.stopsTotal,
    minutesToStop: delivered ? null : reading.minutesToStop,
    driverName: reading.driverName,
    outForDelivery: delivered ? false : reading.outForDelivery,
  })

  // A delayed parcel's new day, booked by the courier, is the 'new date'
  // email the delay promised rather than the ordinary window one. A courier
  // whose page shows a holding window (AIT) has its day told and its times
  // kept off every email (lib/tracking/provisional-window.ts).
  const courierTimes = courierTimesEmailable(courier.trackingSource)
  const answeredDelay = !delivered && await maybeAnswerDelayFromCourier(parcel, reading, timezone, courierTimes)
  if (!answeredDelay) await maybeSendCarrierWindowEmail(parcel, reading, timezone, courierTimes)

  await recordTrackingPageDetails(parcel.id, {
    clientId: reading.clientId,
    routeId: reading.routeId,
    crewLine: reading.crewLine,
    dropsAway: reading.dropsAway,
    destinationLat: reading.destinationLat,
    destinationLng: reading.destinationLng,
  })

  // A courier that hands the crew's position over with everything else (AIT)
  // has it written here, so the order page opens with the van already on the
  // map. No time of the courier's own comes with it: the row's polled-at is
  // the only clock, and the page says "Checked" rather than "Updated" for it.
  if (reading.vehicle && !delivered) {
    await recordVehiclePosition(parcel.id, {
      lat: reading.vehicle.lat,
      lng: reading.vehicle.lng,
      heading: null,
      fixedAt: null,
    })
  }

  if (reading.receivedBy) {
    await recordReceipt(parcel.id, { receivedBy: reading.receivedBy, receivedAt: reading.receivedAt })
  }

  // A parcel travelling as several boxes: each box's own stage and proof,
  // written back whole. Before the parcel's own proof below, which on a split
  // delivery is the last box's photograph rather than a fetch of its own.
  const boxes = reading.consignment ? await storeConsignment(parcel, reading.consignment) : null

  let signatureStored = false
  const lastBox = boxes && delivered ? lastDeliveredBoxWithPhoto(boxes) : null
  if (lastBox && !parcel.signatureUrl && lastBox.photoUrl && lastBox.photoKey) {
    await recordSignature(parcel.id, {
      signedBy: lastBox.receivedBy,
      signedAt: lastBox.deliveredAt ? new Date(lastBox.deliveredAt) : null,
      url: lastBox.photoUrl,
      key: lastBox.photoKey,
    })
    signatureStored = true
  } else if (delivered && !parcel.signatureUrl) {
    const order = await getOrderById(parcel.orderId)
    const reference = order?.orderNumber ?? parcel.id
    const signature = reading.multidropHtml ? parseSignature(reading.multidropHtml, timezone) : null

    const stored = signature?.imageUrl
      ? await captureSignature(signature.imageUrl, reference, { orderNumber: order?.orderNumber })
      : reading.proofImage
        ? await captureSignature(reading.proofImage.url, reference, {
            headers: reading.proofImage.headers,
            label: reading.proofImage.label,
            orderNumber: order?.orderNumber,
          })
        : null

    if (stored) {
      await recordSignature(parcel.id, {
        signedBy: signature?.signedBy ?? reading.receivedBy,
        signedAt: signature?.signedAt ?? reading.receivedAt,
        url: stored.url,
        key: stored.key,
      })
      signatureStored = true
    }
  }

  return { delivered, moved, signatureStored }
}

/** The box that landed last and came with a photograph - the parcel's proof
 *  of delivery as a whole, once every box is in. */
function lastDeliveredBoxWithPhoto(boxes: ConsignmentParcel[]): ConsignmentParcel | null {
  return [...boxes]
    .filter((b) => b.delivered && b.photoUrl)
    .sort((a, b) => (a.deliveredAt ?? '').localeCompare(b.deliveredAt ?? ''))
    .at(-1) ?? null
}

/**
 * Each box's photograph kept as the site's own, then the list written back.
 *
 * Boxes left together share one photograph - DPD take a picture per drop - so
 * a photograph is fetched once and every box carrying the same courier key
 * points at the one copy. A fetch that fails leaves the box without, and the
 * next check tries again: the box is not "done" until it has one.
 */
async function storeConsignment(parcel: ShpShipment, consignment: ConsignmentReading): Promise<ConsignmentParcel[]> {
  const boxes = consignment.parcels.map((b) => ({ ...b }))
  const pending = consignment.photos.filter((photo) => boxes.some((b) => b.code === photo.code && !b.photoUrl))

  if (pending.length > 0) {
    const order = await getOrderById(parcel.orderId)
    const reference = order?.orderNumber ?? parcel.id
    const kept = new Map<string, { url: string; key: string }>()
    for (const b of boxes) {
      if (b.photoRef && b.photoUrl && b.photoKey) kept.set(b.photoRef, { url: b.photoUrl, key: b.photoKey })
    }

    for (const photo of pending) {
      const box = boxes.find((b) => b.code === photo.code)
      if (!box) continue
      let stored = kept.get(photo.ref) ?? null
      if (!stored) {
        // Numbered by the drop, so a second delivery day's photograph does not
        // land on top of the first one's name.
        stored = await captureSignature(photo.url, `${reference}-drop-${kept.size + 1}`, {
          headers: photo.headers,
          label: 'delivery-photo',
          orderNumber: order?.orderNumber,
        })
        if (stored) kept.set(photo.ref, stored)
      }
      if (stored) {
        box.photoUrl = stored.url
        box.photoKey = stored.key
        box.photoRef = photo.ref
      }
    }
  }

  await recordConsignment(parcel.id, { number: consignment.number, parcels: boxes })
  return boxes
}
