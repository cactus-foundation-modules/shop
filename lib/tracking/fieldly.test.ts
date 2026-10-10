import { afterEach, describe, expect, it, vi } from 'vitest'
import { fieldlyCode, fieldlyLink } from '@/modules/shop/lib/tracking/fieldly-link'
import { fieldlyFeedUrl, parseFieldlyWindow, readFieldly, readFieldlyPayload, resetFieldlyCache } from '@/modules/shop/lib/tracking/fieldly'
import { LINK_ONLY, linkOnlySourceOf } from '@/modules/shop/lib/tracking/link-only'
import { stageMeaning, courierAloneSaysArrived } from '@/modules/shop/lib/tracking/stage-meaning'
import delivered from '@/modules/shop/lib/tracking/__fixtures__/fieldly-delivered.json'
import loaded from '@/modules/shop/lib/tracking/__fixtures__/fieldly-loaded.json'

// Their real replies, captured 10 October 2026 from two Jewell Enterprises
// parcels of Deskwell's: one delivered on 30 September, one loaded on Friday
// for Monday 12 October, 2-4pm. The customer fields held the order number.

const TZ = 'Europe/London'

describe('fieldlyCode', () => {
  it('takes the code out of their link, upper-cased', () => {
    expect(fieldlyCode('https://fieldly.lt-innovations.co.uk/track/689C21A2D2')).toBe('689C21A2D2')
    expect(fieldlyCode('fieldly.lt-innovations.co.uk/track/689c21a2d2/')).toBe('689C21A2D2')
    expect(fieldlyCode('https://fieldly.lt-innovations.co.uk/track/689C21A2D2?utm=sms#x')).toBe('689C21A2D2')
  })

  it('refuses a bare code and other sites', () => {
    expect(fieldlyCode('689C21A2D2')).toBeNull()
    expect(fieldlyCode('https://evil.example/track/689C21A2D2')).toBeNull()
    expect(fieldlyCode('https://fieldly.lt-innovations.co.uk.evil.example/track/689C21A2D2')).toBeNull()
    expect(fieldlyCode(null)).toBeNull()
  })

  it('stores one canonical shape, and the link-only rules know it', () => {
    expect(fieldlyLink('689c21a2d2')).toBe('https://fieldly.lt-innovations.co.uk/track/689C21A2D2')
    expect(LINK_ONLY.fieldly.canonical('fieldly.lt-innovations.co.uk/track/689c21a2d2'))
      .toBe('https://fieldly.lt-innovations.co.uk/track/689C21A2D2')
    expect(linkOnlySourceOf('https://fieldly.lt-innovations.co.uk/track/689C21A2D2')).toBe('fieldly')
    expect(linkOnlySourceOf('https://aithd.com/kz0vkrz')).toBe('ait')
    expect(fieldlyFeedUrl('https://fieldly.lt-innovations.co.uk/track/689C21A2D2'))
      .toBe('https://fieldly.lt-innovations.co.uk/api/public/tracking/689C21A2D2')
  })
})

describe('parseFieldlyWindow', () => {
  it('reads the shapes they write', () => {
    expect(parseFieldlyWindow('2-4pm')).toEqual({ start: '14:00', end: '16:00' })
    expect(parseFieldlyWindow('10am-12pm')).toEqual({ start: '10:00', end: '12:00' })
    expect(parseFieldlyWindow('11-1pm')).toEqual({ start: '11:00', end: '13:00' })
    expect(parseFieldlyWindow('9:30am - 11.30am')).toEqual({ start: '09:30', end: '11:30' })
    expect(parseFieldlyWindow('8am to 6pm')).toEqual({ start: '08:00', end: '18:00' })
  })

  it('refuses anything it would have to guess', () => {
    expect(parseFieldlyWindow('AM')).toBeNull()
    expect(parseFieldlyWindow('2-4')).toBeNull()
    expect(parseFieldlyWindow('4pm-2pm')).toBeNull()
    expect(parseFieldlyWindow(null)).toBeNull()
  })
})

describe('readFieldlyPayload', () => {
  it('reads a loaded parcel: their words, the booked day and window, history newest first', () => {
    const r = readFieldlyPayload(loaded, TZ)!
    expect(r.stage).toBe('Loaded')
    expect(r.delivered).toBeNull()
    expect(r.outForDelivery).toBeNull()
    // 2-4pm BST on Monday 12 October is 13:00-15:00 UTC.
    expect(r.windowFrom?.toISOString()).toBe('2026-10-12T13:00:00.000Z')
    expect(r.windowTo?.toISOString()).toBe('2026-10-12T15:00:00.000Z')
    expect(r.events[0]).toEqual({ at: '2026-10-09T15:29:00', location: '', text: 'Loaded' })
    expect(r.events.map((e) => e.text)).toContain('Delivery scheduled - Monday 12th of October')
    expect(r.events.map((e) => e.text)).toContain('Delivery time changed - Set to 2-4pm')
    expect(r.receivedBy).toBeNull()
    expect(r.proofImageUrl).toBeNull()
  })

  it('reads a delivered parcel as delivered by their own flag', () => {
    const r = readFieldlyPayload(delivered, TZ)!
    expect(r.stage).toBe('Delivered')
    expect(r.delivered).toBe(true)
    expect(r.stopNumber).toBeNull()
    // Their two "Delivered" rows at one moment are said once.
    expect(r.events.filter((e) => e.text === 'Delivered')).toHaveLength(1)
  })

  it('a day with no window yet is the whole day, not a time', () => {
    const raw = structuredClone(loaded) as typeof loaded
    raw.order_details.plannedWindow = null as unknown as string
    const r = readFieldlyPayload(raw, TZ)!
    expect(r.windowFrom?.toISOString()).toBe('2026-10-11T23:00:00.000Z')
    expect(r.windowTo?.toISOString()).toBe('2026-10-12T22:59:00.000Z')
  })

  it('keeps proof only once delivered, and only https', () => {
    const raw = structuredClone(delivered) as Record<string, unknown>
    raw.proof = {
      receiverName: 'J Smith',
      deliveredAt: '2026-09-30T09:54:00Z',
      signatureUrl: 'http://insecure.example/sig.png',
      photos: ['https://cdn.example/photo.jpg'],
    }
    const r = readFieldlyPayload(raw, TZ)!
    expect(r.receivedBy).toBe('J Smith')
    expect(r.receivedAt?.toISOString()).toBe('2026-09-30T09:54:00.000Z')
    expect(r.proofImageUrl).toBe('https://cdn.example/photo.jpg')
    expect(r.proofImageLabel).toBe('delivery-photo')
  })

  it('learns nothing from an error object', () => {
    expect(readFieldlyPayload({ error: 'Tracking code not found' }, TZ)).toBeNull()
  })
})

describe('Fieldly stage meaning', () => {
  const courier = { trackingSource: 'fieldly' as const, outForDeliveryStages: [], deliveredStages: [], failedStages: [] }

  it('knows "Delivered" with no setting, and nothing else', () => {
    expect(stageMeaning(courier, 'Delivered')).toBe('delivered')
    expect(stageMeaning(courier, 'Loaded')).toBe('progress')
    expect(stageMeaning({ ...courier, outForDeliveryStages: ['Loaded'] }, 'Loaded')).toBe('out-for-delivery')
  })

  it('leaves arrival to the courier once it has been read', () => {
    expect(courierAloneSaysArrived(courier, 'Loaded')).toBe(true)
    expect(courierAloneSaysArrived(courier, null)).toBe(false)
  })
})

describe('readFieldly', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetFieldlyCache()
  })

  it('asks their feed once and shares the answer', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(loaded), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const link = 'https://fieldly.lt-innovations.co.uk/track/689C21A2D2'
    const [a, b] = await Promise.all([readFieldly(link, TZ, 1000), readFieldly(link, TZ, 1000)])
    expect(a?.stage).toBe('Loaded')
    expect(b?.stage).toBe('Loaded')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('takes a 404 as an answer, without a retry', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":"Tracking code not found"}', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await readFieldly('https://fieldly.lt-innovations.co.uk/track/ZZZZZZZZZZ', TZ)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('never asks anybody about a link that is not theirs', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await readFieldly('https://evil.example/track/689C21A2D2', TZ)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
