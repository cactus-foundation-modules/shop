import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_READING } from '@/modules/shop/lib/tracking/reading'
import type { ParcelReading } from '@/modules/shop/lib/tracking/read-parcel'
import { newConsignmentParcel, type ConsignmentParcel } from '@/modules/shop/lib/consignment-parcels'
import type { ShpShipment } from '@/modules/shop/lib/types'

// Writing one reading to the parcel row. The database, the emails and the
// media library are stood in for: what is under test is which writes happen.

const recordVehiclePosition = vi.hoisted(() => vi.fn())
const recordConsignment = vi.hoisted(() => vi.fn())
const recordSignature = vi.hoisted(() => vi.fn())
const recordDeliveryPhoto = vi.hoisted(() => vi.fn())
const recordCarrierReading = vi.hoisted(() => vi.fn())
const captureSignature = vi.hoisted(() => vi.fn(async (): Promise<{ url: string; key: string } | null> => null))
vi.mock('@/modules/shop/lib/db/shipments', () => ({
  recordConsignment,
  recordCarrierReading,
  recordReceipt: vi.fn(),
  recordSignature,
  recordDeliveryPhoto,
  recordTrackingPageDetails: vi.fn(),
  recordTrackingStage: vi.fn(),
  recordVehiclePosition,
}))
vi.mock('@/modules/shop/lib/db/orders', () => ({ getOrderById: vi.fn(async () => ({ orderNumber: 'DW000001' })) }))
const maybeSendCourierDayEmail = vi.hoisted(() => vi.fn())
vi.mock('@/modules/shop/lib/delivery-slot-email', () => ({ maybeSendCarrierWindowEmail: vi.fn(), maybeSendCourierDayEmail }))
vi.mock('@/modules/shop/lib/failed-delivery-email', () => ({ maybeSendFailedDeliveryEmail: vi.fn() }))
vi.mock('@/modules/shop/lib/tracking/signature-capture', () => ({ captureSignature }))

const { storeParcelReading } = await import('@/modules/shop/lib/tracking/store-reading')

const ait = { trackingSource: 'ait' as const, outForDeliveryStages: [], deliveredStages: [], failedStages: [] }
const parcel = { id: 'shp_1', orderId: 'ord_1', trackingStage: null, signatureUrl: null } as unknown as ShpShipment

function reading(patch: Partial<ParcelReading>): ParcelReading {
  return {
    ...EMPTY_READING,
    multidropHtml: null,
    proofImage: null,
    deliveryPhoto: null,
    vehicle: null,
    clientId: null,
    routeId: null,
    crewLine: null,
    dropsAway: null,
    destinationLat: null,
    destinationLng: null,
    consignment: null,
    scheduledDate: null,
    ...patch,
  }
}

describe('storeParcelReading with a van in the reading', () => {
  beforeEach(() => recordVehiclePosition.mockClear())

  it('writes the position with no time of the courier\'s own', async () => {
    await storeParcelReading(ait, parcel, reading({
      stage: 'Out for delivery', outForDelivery: true, delivered: false, vehicle: { lat: '51.5', lng: '-0.08' },
    }), 'Europe/London')
    expect(recordVehiclePosition).toHaveBeenCalledWith('shp_1', { lat: '51.5', lng: '-0.08', heading: null, fixedAt: null })
  })

  it('stops writing it once the parcel has arrived', async () => {
    await storeParcelReading(ait, parcel, reading({
      stage: 'Delivered', delivered: true, vehicle: { lat: '51.5', lng: '-0.08' },
    }), 'Europe/London')
    expect(recordVehiclePosition).not.toHaveBeenCalled()
  })
})

describe('storeParcelReading with a parcel out for delivery on a later due day', () => {
  const palletways = {
    trackingSource: 'palletways' as const,
    outForDeliveryStages: ['OUT FOR DELIVERY'],
    deliveredStages: ['DELIVERED'],
    failedStages: [],
  }
  // Their row: OUT FOR DELIVERY, currently due tomorrow, by 17:00.
  const dueTomorrow = { windowFrom: new Date('2026-10-28T00:00:00Z'), windowTo: new Date('2026-10-28T17:00:00Z') }

  beforeEach(() => {
    recordCarrierReading.mockClear()
    vi.useFakeTimers({ now: new Date('2026-10-27T13:00:00Z'), toFake: ['Date'] })
  })
  afterEach(() => vi.useRealTimers())

  it('stores the window as today, at the same times', async () => {
    await storeParcelReading(palletways, parcel, reading({ stage: 'OUT FOR DELIVERY', ...dueTomorrow }), 'Europe/London')
    expect(recordCarrierReading).toHaveBeenCalledWith('shp_1', expect.objectContaining({
      windowFrom: new Date('2026-10-27T00:00:00Z'),
      windowTo: new Date('2026-10-27T17:00:00Z'),
    }))
  })

  it('keeps the due day while the pallet is still at the depot', async () => {
    await storeParcelReading(palletways, parcel, reading({ stage: 'AT DELIVERY DEPOT', ...dueTomorrow }), 'Europe/London')
    expect(recordCarrierReading).toHaveBeenCalledWith('shp_1', expect.objectContaining(dueTomorrow))
  })
})

describe('storeParcelReading with several boxes', () => {
  const dpd = { trackingSource: 'dpd' as const, outForDeliveryStages: [], deliveredStages: [], failedStages: [] }
  const box = (n: number, patch: Partial<ConsignmentParcel> = {}): ConsignmentParcel => ({
    ...newConsignmentParcel(`code-${n}`, `number-${n}`), delivered: true, deliveredAt: `2026-10-16T11:0${n}:00.000Z`, ...patch,
  })

  beforeEach(() => {
    recordConsignment.mockClear()
    recordSignature.mockClear()
    captureSignature.mockClear()
    captureSignature.mockImplementation(async () => ({ url: 'https://media/photo.jpg', key: 'media/photo.jpg' }))
  })

  it('keeps a photograph two boxes share once, and gives it to both', async () => {
    const photo = (code: string) => ({ code, ref: 'drop-1', url: `https://dpd/${code}`, headers: {} })
    await storeParcelReading(dpd, parcel, reading({
      stage: 'Your parcel will be with you today', delivered: false,
      consignment: { number: 'C1', parcels: [box(1), box(2), box(3, { delivered: false, deliveredAt: null })], photos: [photo('code-1'), photo('code-2')] },
    }), 'Europe/London')
    expect(captureSignature).toHaveBeenCalledTimes(1)
    const written = recordConsignment.mock.calls[0]?.[1] as { parcels: ConsignmentParcel[] }
    expect(written.parcels.map((p) => p.photoUrl)).toEqual(['https://media/photo.jpg', 'https://media/photo.jpg', null])
    expect(recordSignature).not.toHaveBeenCalled()
  })

  it('takes the last drop\'s photograph as the parcel\'s proof once every box is in', async () => {
    await storeParcelReading(dpd, parcel, reading({
      stage: 'Your parcel has been delivered', delivered: true,
      consignment: {
        number: 'C1',
        parcels: [
          box(1, { photoUrl: 'https://media/first.jpg', photoKey: 'first', photoRef: 'a', receivedBy: 'Lee' }),
          box(2, { photoUrl: 'https://media/second.jpg', photoKey: 'second', photoRef: 'b', receivedBy: 'Sam' }),
        ],
        photos: [],
      },
    }), 'Europe/London')
    expect(captureSignature).not.toHaveBeenCalled()
    expect(recordSignature).toHaveBeenCalledWith('shp_1', expect.objectContaining({ url: 'https://media/second.jpg', signedBy: 'Sam' }))
  })
})

describe('storeParcelReading with a day booked and no times yet', () => {
  const multidrop = { trackingSource: 'multidrop' as const, outForDeliveryStages: [], deliveredStages: ['Complete'], failedStages: [] }

  beforeEach(() => maybeSendCourierDayEmail.mockClear())

  it('hands the courier\'s day on to be put on the parcel and told', async () => {
    await storeParcelReading(multidrop, parcel, reading({ stage: 'Date Confirmed', scheduledDate: '2026-11-11' }), 'Europe/London')
    expect(maybeSendCourierDayEmail).toHaveBeenCalledWith(parcel, '2026-11-11', 'Europe/London')
  })

  it('does not once the parcel has arrived', async () => {
    await storeParcelReading(multidrop, parcel, reading({ stage: 'Complete', scheduledDate: '2026-11-11' }), 'Europe/London')
    expect(maybeSendCourierDayEmail).not.toHaveBeenCalled()
  })
})

describe('storeParcelReading with a delivery note and a photograph (Palletways)', () => {
  const palletways = { trackingSource: 'palletways' as const, outForDeliveryStages: [], deliveredStages: ['JOB COMPLETE'], failedStages: [] }
  const headers = { referer: 'https://track2.palletways.com/index.php?dc_syscon=60051828127' }
  const delivered = reading({
    stage: 'JOB COMPLETE',
    receivedBy: 'Alan',
    receivedAt: new Date('2026-11-12T09:34:00Z'),
    proofImage: { url: 'https://track2.palletways.com/show_pod.php?fullsize=true&file=n_sos_pod.tif', headers, label: 'delivery-note' },
    deliveryPhoto: { url: 'https://track2.palletways.com/show_pod.php?fullsize=true&file=n_pod_photo_1.jpg', headers, label: 'delivery-photo' },
  })

  beforeEach(() => {
    captureSignature.mockReset()
    captureSignature.mockImplementation(async () => ({ url: 'https://media/x.jpg', key: 'x.jpg' }))
    recordSignature.mockClear()
    recordDeliveryPhoto.mockClear()
  })

  it('keeps the note as the signature and the photograph beside it, both asked with their referer', async () => {
    await storeParcelReading(palletways, { ...parcel, deliveryPhotoUrl: null } as ShpShipment, delivered, 'Europe/London')
    expect(captureSignature).toHaveBeenCalledWith(delivered.proofImage?.url, 'DW000001', expect.objectContaining({ headers, label: 'delivery-note' }))
    expect(captureSignature).toHaveBeenCalledWith(delivered.deliveryPhoto?.url, 'DW000001', expect.objectContaining({ headers, label: 'delivery-photo' }))
    expect(recordSignature).toHaveBeenCalledWith('shp_1', expect.objectContaining({ signedBy: 'Alan' }))
    expect(recordDeliveryPhoto).toHaveBeenCalledWith('shp_1', { url: 'https://media/x.jpg', key: 'x.jpg' })
  })

  it('does not fetch the photograph again once one is kept', async () => {
    await storeParcelReading(palletways, { ...parcel, deliveryPhotoUrl: 'https://media/kept.jpg' } as ShpShipment, delivered, 'Europe/London')
    expect(recordDeliveryPhoto).not.toHaveBeenCalled()
  })
})
