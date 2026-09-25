import {
  recordCarrierReading,
  recordReceipt,
  recordSignature,
  recordTrackingPageDetails,
  recordTrackingStage,
} from '@/modules/shop/lib/db/shipments'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { maybeSendCarrierWindowEmail } from '@/modules/shop/lib/delivery-slot-email'
import { maybeSendFailedDeliveryEmail } from '@/modules/shop/lib/failed-delivery-email'
import { parseSignature } from '@/modules/shop/lib/tracking/multidrop-page'
import { captureSignature } from '@/modules/shop/lib/tracking/signature-capture'
import { stageMeaning } from '@/modules/shop/lib/tracking/stage-meaning'
import type { ParcelReading } from '@/modules/shop/lib/tracking/read-parcel'
import type { ShpCourier } from '@/modules/shop/lib/courier-faqs'
import type { ShpShipment } from '@/modules/shop/lib/types'

/** Write one courier reading to the parcel row, shared by the hourly job and
 *  the page poll that runs while somebody is watching. */
export async function storeParcelReading(
  courier: Pick<ShpCourier, 'outForDeliveryStages' | 'deliveredStages' | 'failedStages'>,
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

  await maybeSendCarrierWindowEmail(parcel, reading, timezone)

  await recordTrackingPageDetails(parcel.id, {
    clientId: reading.clientId,
    routeId: reading.routeId,
    crewLine: reading.crewLine,
    dropsAway: reading.dropsAway,
    destinationLat: reading.destinationLat,
    destinationLng: reading.destinationLng,
  })

  if (reading.receivedBy) {
    await recordReceipt(parcel.id, { receivedBy: reading.receivedBy, receivedAt: reading.receivedAt })
  }

  let signatureStored = false
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
