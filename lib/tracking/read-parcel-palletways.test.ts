import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CARD_DELIVERED, CARD_FULL_DELIVERED } from '@/modules/shop/lib/tracking/__fixtures__/palletways-rebuilt'
import type { ShpShipment } from '@/modules/shop/lib/types'

// Which way readPalletways asks, against both shapes of their site: the
// rebuilt one (postcode posted to index.php, tt2.php and tt_basic.php
// redirecting to the open card) and the old one (tt2.php with a Referer).

let postcode: string | null = 'XX1 1XX'
vi.mock('@/modules/shop/lib/db/orders', async (original) => ({
  ...(await original<typeof import('@/modules/shop/lib/db/orders')>()),
  getOrderDeliveryPostcode: vi.fn(async () => postcode),
}))

const { readParcelTracking } = await import('@/modules/shop/lib/tracking/read-parcel')

const OLD_FULL = `
<table class='table table-bordered'>
  <thead><tr><th>Palletways Tracking ID</th><th>Currently Due By</th><th>Status</th></tr></thead>
  <tbody><tr><td>60052045327</td><td>26/11/2026 - 17:00</td><td>JOB COMPLETE</td></tr></tbody>
</table>
<table class='table' id='tbl_notes'>
  <tbody><tr><td>CLEAN POD</td><td>1</td><td></td><td>Alan @ 10:12 2026-11-26</td><td>26/11/2026</td><td>10:12</td></tr></tbody>
</table>`

type Page = { method: string; url: string; body: string | null }
let calls: Page[] = []
let answer: (page: Page) => string | null = () => null

beforeEach(() => {
  postcode = 'XX1 1XX'
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const page = { method: init?.method ?? 'GET', url, body: typeof init?.body === 'string' ? init.body : null }
    calls.push(page)
    const html = answer(page)
    return html === null ? new Response('', { status: 404 }) : new Response(html, { status: 200 })
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const courier = { trackingSource: 'palletways' as const, gfsCarrier: '', palletwaysDueBy: '17:00' }
const parcel = { id: 'shp_1', orderId: 'ord_1', trackingUrl: 'https://track2.palletways.com/index.php?dc_syscon=60052045327', trackingNumber: null } as unknown as ShpShipment
const read = () => readParcelTracking(courier, parcel, 'Europe/London')

describe('readPalletways', () => {
  it('posts the postcode to the rebuilt form and reads the unlocked page', async () => {
    answer = (p) => (p.method === 'POST' ? CARD_FULL_DELIVERED : null)
    const reading = await read()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ method: 'POST', url: 'https://track2.palletways.com/index.php', body: 'dc_syscon=60052045327&postcode=XX1+1XX' })
    expect(reading?.delivered).toBe(true)
    expect(reading?.receivedBy).toBe('Alan')
    expect(reading?.proofImage?.label).toBe('delivery-note')
    expect(reading?.deliveryPhoto?.label).toBe('delivery-photo')
  })

  it('falls back to the old details page when the form does not answer', async () => {
    answer = (p) => (p.url.includes('/tt2.php') ? OLD_FULL : null)
    const reading = await read()
    expect(calls.map((c) => c.method)).toEqual(['POST', 'GET'])
    expect(reading?.stage).toBe('JOB COMPLETE')
    expect(reading?.delivered).toBeNull()
    expect(reading?.receivedBy).toBe('Alan')
  })

  it('tries the old page when the form gives only the open card, and keeps the card if that fails too', async () => {
    answer = (p) => (p.method === 'POST' ? CARD_DELIVERED : null)
    const reading = await read()
    expect(calls.map((c) => c.method)).toEqual(['POST', 'GET'])
    expect(reading?.stage).toBe('Delivered')
    expect(reading?.delivered).toBe(true)
  })

  it('reads the open card where there is no postcode', async () => {
    postcode = null
    answer = (p) => (p.url.includes('/tt_basic.php') ? CARD_DELIVERED : null)
    const reading = await read()
    expect(calls.map((c) => c.method)).toEqual(['GET'])
    expect(reading?.stage).toBe('Delivered')
    expect(reading?.events).toHaveLength(3)
  })
})
