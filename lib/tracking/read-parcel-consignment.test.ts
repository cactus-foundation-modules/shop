import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newConsignmentParcel, type ConsignmentParcel } from '@/modules/shop/lib/consignment-parcels'
import type { ShpShipment } from '@/modules/shop/lib/types'

// The DW000231 shape: four DPD boxes under 5217099684. 684-686 delivered
// together and photographed once; 687 held at a hub.
const DELIVERED = 'Your parcel has been delivered'
const HELD = "There's a delay with your parcel at our sortation facility"
let state: Record<string, string> = {}

function parcelPayload(code: string, cookie: string | null) {
  const stage = state[code]
  if (!stage) return null
  const delivered = stage === DELIVERED
  return {
    data: {
      parcelCode: code,
      parcelNumber: code.split('*')[0],
      consignmentNumber: '5217099684',
      trackingStatusCurrent: stage,
      ...(cookie ? { deliveredToConsumer: delivered } : {}),
      ...(cookie && delivered
        ? {
            image: [{ key: '0161*21474*213*3600*69*001*0*1', type: 'S5', caption: 'Delivered to recipient' }],
            deliveryDetails: { podDetails: { podName: 'Lee', podDate: '2026-10-16 12:06:00' } },
          }
        : {}),
    },
  }
}

const mintDpdSession = vi.fn(async (shortCode: string) => ({ cookie: `sessionId=${shortCode}`, parcelCode: `1550${shortCode}*21473` }))
const fetchDpdParcel = vi.fn(async (code: string, cookie: string | null) => ({
  parcel: parcelPayload(code, cookie),
  events: { data: state[code] ? [{ eventDate: '2026-10-16 12:06:00', eventLocation: 'DPD', eventText: state[code] }] : [] },
  session: Boolean(cookie),
}))
const lookUpDpdParcel = vi.fn(async (code: string) => parcelPayload(code, null) ?? 'missing')
vi.mock('@/modules/shop/lib/tracking/dpd-session', () => ({
  mintDpdSession,
  fetchDpdParcel,
  fetchDpdRoute: vi.fn(async () => null),
  lookUpDpdParcel,
}))

const { readParcelTracking } = await import('@/modules/shop/lib/tracking/read-parcel')

const dpd = { trackingSource: 'dpd' as const, gfsCarrier: '' }
const code = (n: number) => `1550521709968${n}*21473`

function shipment(patch: Partial<ShpShipment>): ShpShipment {
  return {
    id: 'shp_1',
    orderId: 'ord_1',
    trackingUrl: `https://track.dpd.co.uk/parcels/${code(7)}`,
    trackingShortCode: null,
    consignmentNumber: null,
    consignmentParcels: null,
    ...patch,
  } as ShpShipment
}

function boxes(patch: (box: ConsignmentParcel, n: number) => Partial<ConsignmentParcel> = () => ({})): ConsignmentParcel[] {
  return [4, 5, 6, 7].map((n) => {
    const box = newConsignmentParcel(code(n), `1550 5217 099 68${n}`)
    return { ...box, ...patch(box, n) }
  })
}

beforeEach(() => {
  state = { [code(4)]: DELIVERED, [code(5)]: DELIVERED, [code(6)]: DELIVERED, [code(7)]: HELD }
  mintDpdSession.mockClear()
  fetchDpdParcel.mockClear()
})

describe('a DPD delivery in several boxes', () => {
  it('is not delivered while one box is still out - the DW000231 case', async () => {
    const reading = await readParcelTracking(dpd, shipment({}), 'Europe/London')
    expect(reading?.delivered).toBe(false)
    expect(reading?.stage).toBe(HELD)
    expect(reading?.consignment?.number).toBe('5217099684')
    expect(reading?.consignment?.parcels.map((p) => p.delivered)).toEqual([true, true, true, false])
  })

  it('found from a box that HAS been delivered is still not delivered', async () => {
    const reading = await readParcelTracking(
      dpd,
      shipment({ trackingUrl: `https://track.dpd.co.uk/parcels/${code(4)}` }),
      'Europe/London',
    )
    expect(reading?.delivered).toBe(false)
    expect(reading?.stage).toBe(HELD)
  })

  it('is delivered once the last box is, with each drop\'s photograph to keep', async () => {
    state[code(7)] = DELIVERED
    const reading = await readParcelTracking(dpd, shipment({
      consignmentNumber: '5217099684',
      consignmentParcels: boxes((_, n) => (n === 7 ? { shortCode: '5217099687' } : { delivered: true, deliveredAt: '2026-10-16T11:06:00.000Z' })),
    }), 'Europe/London')
    expect(reading?.delivered).toBe(true)
    expect(reading?.consignment?.photos.map((p) => p.code)).toEqual([code(7)])
  })

  it('does not ask again about a box that has landed and has nothing more to give', async () => {
    await readParcelTracking(dpd, shipment({
      consignmentNumber: '5217099684',
      consignmentParcels: boxes((_, n) => (n === 7 ? {} : { delivered: true })),
    }), 'Europe/London')
    expect(fetchDpdParcel.mock.calls.map((c) => c[0])).toEqual([code(7)])
  })

  it('says nothing about the parcel when the box still to come cannot be read', async () => {
    delete state[code(7)]
    const reading = await readParcelTracking(dpd, shipment({
      consignmentNumber: '5217099684',
      consignmentParcels: boxes((_, n) => (n === 7 ? {} : { delivered: true })),
    }), 'Europe/London')
    expect(reading).toBeNull()
  })
})
