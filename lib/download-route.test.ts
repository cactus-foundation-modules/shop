import { beforeEach, describe, expect, it, vi } from 'vitest'

// The download route's slot accounting, end to end with the database stood in
// for. The rule it has to keep: a download is taken before any bytes go (so
// parallel requests cannot share the last one), and handed back by every way a
// transfer can fail to finish - so a customer is only ever charged a download
// for a file they actually received.

const db = vi.hoisted(() => ({
  getDownloadByToken: vi.fn(),
  getDigitalFileById: vi.fn(),
  reserveDownloadSlot: vi.fn(),
  releaseDownloadSlot: vi.fn(),
  getOrderById: vi.fn(),
  getOrderItemById: vi.fn(),
  getProductById: vi.fn(),
}))

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }))
vi.mock('@/modules/shop/lib/access', () => ({ shopClosedResponse: async () => null }))
vi.mock('@/modules/shop/lib/db/digital', () => ({
  getDownloadByToken: db.getDownloadByToken,
  getDigitalFileById: db.getDigitalFileById,
  reserveDownloadSlot: db.reserveDownloadSlot,
  releaseDownloadSlot: db.releaseDownloadSlot,
}))
vi.mock('@/modules/shop/lib/db/orders', () => ({ getOrderById: db.getOrderById, getOrderItemById: db.getOrderItemById }))
vi.mock('@/modules/shop/lib/db/products', () => ({ getProductById: db.getProductById }))

import { GET } from '@/modules/shop/app/api/public/downloads/[token]/route'

const params = { params: Promise.resolve({ token: 'tok' }) }
const request = new Request('https://shop.test/api/m/shop/public/downloads/tok')

function upstreamOf(chunks: string[], failAfter?: number): Response {
  const encoder = new TextEncoder()
  let sent = 0
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (failAfter !== undefined && sent === failAfter) {
        controller.error(new Error('storage went away'))
        return
      }
      const next = chunks[sent++]
      if (next === undefined) controller.close()
      else controller.enqueue(encoder.encode(next))
    },
  }), { status: 200, headers: { 'content-length': String(chunks.join('').length) } })
}

beforeEach(() => {
  vi.restoreAllMocks()
  for (const mock of Object.values(db)) mock.mockReset()
  db.getDownloadByToken.mockResolvedValue({ id: 'dl-1', orderId: 'ord-1', orderItemId: 'item-1', fileId: 'file-1', token: 'tok', downloadCount: 0, expiresAt: null, createdAt: new Date() })
  db.getOrderById.mockResolvedValue({ status: 'PROCESSING', paymentStatus: 'PAID' })
  db.getOrderItemById.mockResolvedValue({ productId: 'prod-1', quantity: 1, refundedQty: 0 })
  db.getProductById.mockResolvedValue({ downloadLimit: 3 })
  db.getDigitalFileById.mockResolvedValue({ id: 'file-1', filename: 'Manual.pdf', url: 'https://files.test/manual.pdf', size: 10, mimeType: 'application/pdf' })
  db.reserveDownloadSlot.mockResolvedValue(true)
  db.releaseDownloadSlot.mockResolvedValue(undefined)
})

describe('GET /downloads/[token]', () => {
  it('takes a slot up front, against the product limit, and keeps it once the file has gone', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstreamOf(['hello ', 'world']))
    const response = await GET(request, params)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('hello world')
    expect(db.reserveDownloadSlot).toHaveBeenCalledWith('dl-1', 3)
    expect(db.releaseDownloadSlot).not.toHaveBeenCalled()
  })

  it('answers a HEAD without taking a slot or fetching the file', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const head = new Request('https://shop.test/api/m/shop/public/downloads/tok', { method: 'HEAD' })
    const response = await GET(head, params)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(db.reserveDownloadSlot).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses when the race for the last slot is lost, without fetching the file', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    db.reserveDownloadSlot.mockResolvedValue(false)
    const response = await GET(request, params)
    expect(response.status).toBe(410)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('hands the slot back when the file cannot be fetched', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 404 }))
    expect((await GET(request, params)).status).toBe(502)
    expect(db.releaseDownloadSlot).toHaveBeenCalledTimes(1)
  })

  it('hands the slot back when the fetch itself throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('DNS'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect((await GET(request, params)).status).toBe(502)
    expect(db.releaseDownloadSlot).toHaveBeenCalledTimes(1)
  })

  it('hands the slot back, once, when the customer gives up partway', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstreamOf(['a', 'b', 'c']))
    const response = await GET(request, params)
    const reader = response.body!.getReader()
    await reader.read()
    await reader.cancel('closed the tab')
    expect(db.releaseDownloadSlot).toHaveBeenCalledTimes(1)
  })

  it('hands the slot back when storage fails mid-transfer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstreamOf(['a', 'b'], 1))
    const response = await GET(request, params)
    await expect(response.text()).rejects.toThrow()
    expect(db.releaseDownloadSlot).toHaveBeenCalledTimes(1)
  })

  it('never takes a slot for a refunded line', async () => {
    db.getOrderItemById.mockResolvedValue({ productId: 'prod-1', quantity: 1, refundedQty: 1 })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect((await GET(request, params)).status).toBe(410)
    expect(db.reserveDownloadSlot).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
