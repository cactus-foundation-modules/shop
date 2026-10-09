import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_READING } from '@/modules/shop/lib/tracking/reading'
import type { ParcelReading } from '@/modules/shop/lib/tracking/read-parcel'
import type { ShpShipment } from '@/modules/shop/lib/types'

// Writing one reading to the parcel row. The database, the emails and the
// media library are stood in for: what is under test is which writes happen.

const recordVehiclePosition = vi.hoisted(() => vi.fn())
vi.mock('@/modules/shop/lib/db/shipments', () => ({
  recordCarrierReading: vi.fn(),
  recordReceipt: vi.fn(),
  recordSignature: vi.fn(),
  recordTrackingPageDetails: vi.fn(),
  recordTrackingStage: vi.fn(),
  recordVehiclePosition,
}))
vi.mock('@/modules/shop/lib/db/orders', () => ({ getOrderById: vi.fn(async () => ({ orderNumber: 'DW000001' })) }))
vi.mock('@/modules/shop/lib/delivery-slot-email', () => ({ maybeSendCarrierWindowEmail: vi.fn() }))
vi.mock('@/modules/shop/lib/failed-delivery-email', () => ({ maybeSendFailedDeliveryEmail: vi.fn() }))
vi.mock('@/modules/shop/lib/tracking/signature-capture', () => ({ captureSignature: vi.fn(async () => null) }))

const { storeParcelReading } = await import('@/modules/shop/lib/tracking/store-reading')

const ait = { trackingSource: 'ait' as const, outForDeliveryStages: [], deliveredStages: [], failedStages: [] }
const parcel = { id: 'shp_1', orderId: 'ord_1', trackingStage: null, signatureUrl: null } as unknown as ShpShipment

function reading(patch: Partial<ParcelReading>): ParcelReading {
  return {
    ...EMPTY_READING,
    multidropHtml: null,
    proofImage: null,
    vehicle: null,
    clientId: null,
    routeId: null,
    crewLine: null,
    dropsAway: null,
    destinationLat: null,
    destinationLng: null,
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
