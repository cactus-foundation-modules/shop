import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShpShipmentWithItems } from '@/modules/shop/lib/types'

// A supplier's despatch, announced by another module, put on the customer's
// order - or not - as the shop's own setting says. The database is stood in
// for here so every branch can be pinned; lib/despatch-observer.live.test.ts
// runs the same observer against real Postgres for the SQL.

const config = vi.hoisted(() => vi.fn())
const order = vi.hoisted(() => vi.fn())
const shipments = vi.hoisted(() => vi.fn())
const summary = vi.hoisted(() => vi.fn())
const create = vi.hoisted(() => vi.fn())
const fill = vi.hoisted(() => vi.fn())
const update = vi.hoisted(() => vi.fn())
const follow = vi.hoisted(() => vi.fn())
const slotEmail = vi.hoisted(() => vi.fn())
const dayEmail = vi.hoisted(() => vi.fn())
const trackingEmail = vi.hoisted(() => vi.fn())
const dispatchEmail = vi.hoisted(() => vi.fn())

vi.mock('@/modules/shop/lib/config', () => ({ getShopConfigCached: config }))
vi.mock('@/modules/shop/lib/db/orders', () => ({ getOrderById: order }))
vi.mock('@/modules/shop/lib/db/shipments', () => ({
  getShipmentsForOrder: shipments,
  getOrderDispatchSummary: summary,
  createShipment: create,
  fillBlankShipmentTracking: fill,
  updateShipmentDetails: update,
}))
vi.mock('@/modules/shop/lib/dispatch-follow-up', () => ({
  courierTakesDpdLink: (cfg: { deliveryCouriers: Array<{ id: string; trackingSource: string }> }, id: string | null) =>
    cfg.deliveryCouriers.find((c) => c.id === id)?.trackingSource === 'dpd',
  followDispatchWithStatus: follow,
  maybeSendSlotEmail: slotEmail,
  maybeSendDayEmail: dayEmail,
  maybeSendTrackingEmail: trackingEmail,
}))
vi.mock('@/modules/shop/lib/shipment-email', () => ({ sendShipmentDispatchedEmail: dispatchEmail }))
vi.mock('@/modules/shop/lib/tracking-added-email', () => ({
  hasFollowableTracking: (s: { trackingNumber: string | null; trackingUrl: string | null; trackingShortCode: string | null }) =>
    Boolean(s.trackingNumber?.trim() || s.trackingUrl?.trim() || s.trackingShortCode?.trim()),
}))

const { carriesTracking, observeDespatchRecorded, shopTrackingFor } = await import('./despatch-observer')
type Event = Parameters<typeof observeDespatchRecorded>[0]

const COURIERS = [
  { id: 'dpd', name: 'DPD', trackingSource: 'dpd' },
  { id: 'twoman', name: 'Example Haulage', trackingSource: 'multidrop' },
]

function event(overrides: Partial<Event> = {}): Event {
  return {
    despatchId: 'd1',
    change: 'new',
    purchaseOrderNumber: 'PO-00012',
    source: { module: 'shop', orderId: 'ord-1' },
    lines: [{ sourceOrderItemId: 'item-1', qty: 1 }],
    carrier: 'DPD',
    trackingNumber: '12345678901234',
    trackingUrl: 'https://www.dpd.co.uk/d/AbC123dEf456',
    trackingShortCode: 'AbC123dEf456',
    deliveryDate: null,
    deliverySlot: null,
    ...overrides,
  }
}

function parcel(overrides: Partial<ShpShipmentWithItems> = {}): ShpShipmentWithItems {
  return {
    id: 's1',
    orderId: 'ord-1',
    trackingNumber: null,
    trackingUrl: null,
    trackingShortCode: null,
    carrier: null,
    courierId: null,
    deliveryDate: null,
    deliverySlotStart: null,
    deliverySlotEnd: null,
    items: [{ id: 'si1', shipmentId: 's1', orderItemId: 'item-1', quantity: 1 }],
    ...overrides,
  } as ShpShipmentWithItems
}

function mode(value: 'off' | 'record' | 'record-and-tell') {
  config.mockResolvedValue({ despatchFromSupplierTracking: value, deliveryCouriers: COURIERS })
}

beforeEach(() => {
  for (const mock of [config, order, shipments, summary, create, fill, update, follow, slotEmail, dayEmail, trackingEmail, dispatchEmail]) mock.mockReset()
  mode('record-and-tell')
  order.mockResolvedValue({ id: 'ord-1', orderNumber: 'DW000001', status: 'PROCESSING' })
  shipments.mockResolvedValue([])
  summary.mockResolvedValue({ lines: [{ orderItemId: 'item-1', outstandingQty: 1 }] })
  create.mockResolvedValue({ ok: true, shipment: parcel({ id: 's-new' }) })
  fill.mockResolvedValue(true)
  update.mockImplementation(async (id: string, _o: string, patch: object) => parcel({ id, ...patch }))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('the setting', () => {
  it('off does nothing at all, not even reading the order', async () => {
    mode('off')
    expect(await observeDespatchRecorded(event())).toBe('off')
    expect(order).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('record puts a new parcel on the order and emails nobody', async () => {
    mode('record')
    expect(await observeDespatchRecorded(event())).toBe('created')
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'ord-1',
      items: [{ orderItemId: 'item-1', quantity: 1 }],
      trackingNumber: '12345678901234',
      trackingUrl: 'https://www.dpd.co.uk/d/AbC123dEf456',
      trackingShortCode: 'AbC123dEf456',
      courierId: 'dpd',
      carrier: 'DPD',
      // B3: quiet, so nothing that follows from it emails the customer.
      quietCustomerEmails: true,
    }))
    expect(follow).toHaveBeenCalledWith('ord-1', 'PROCESSING', 'recorded')
    expect(dispatchEmail).not.toHaveBeenCalled()
  })

  it('record-and-tell sends the dispatch note for a new parcel', async () => {
    expect(await observeDespatchRecorded(event())).toBe('created')
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ quietCustomerEmails: false }))
    expect(dispatchEmail).toHaveBeenCalledWith({ orderId: 'ord-1', shipmentId: 's-new' })
  })
})

describe('what the order already has', () => {
  it('fills a parcel that went out with no tracking, and in record-and-tell sends the tracking email', async () => {
    shipments.mockResolvedValueOnce([parcel()]).mockResolvedValue([parcel({ trackingNumber: '12345678901234' })])
    expect(await observeDespatchRecorded(event())).toBe('filled')
    expect(fill).toHaveBeenCalledWith('s1', 'ord-1', expect.objectContaining({ trackingNumber: '12345678901234', courierId: 'dpd' }), false)
    expect(trackingEmail).toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('fills quietly in record', async () => {
    mode('record')
    shipments.mockResolvedValueOnce([parcel()]).mockResolvedValue([parcel({ trackingNumber: '12345678901234' })])
    expect(await observeDespatchRecorded(event())).toBe('filled')
    expect(fill).toHaveBeenCalledWith('s1', 'ord-1', expect.anything(), true)
    expect(trackingEmail).not.toHaveBeenCalled()
  })

  it('N7: fills the blank parcel and records the rest of what was announced as its own parcel', async () => {
    shipments.mockResolvedValue([parcel()])
    summary.mockResolvedValue({ lines: [{ orderItemId: 'item-1', outstandingQty: 0 }, { orderItemId: 'item-2', outstandingQty: 2 }] })
    const both = event({ lines: [{ sourceOrderItemId: 'item-1', qty: 1 }, { sourceOrderItemId: 'item-2', qty: 2 }] })
    expect(await observeDespatchRecorded(both)).toBe('filled')
    expect(create).toHaveBeenCalledTimes(1)
    const input = create.mock.calls[0]![0]
    expect(input.items).toEqual([{ orderItemId: 'item-2', quantity: 2 }])
    expect(input.trackingNumber).toBe('12345678901234')
    // The tracking IS on the order now, so the duplicate guard is not used.
    expect(input.unlessTrackingOnOrder).toBeUndefined()
  })

  it('does nothing when the tracking is already on the order', async () => {
    shipments.mockResolvedValue([parcel({ trackingNumber: '1234 5678 901 234' })])
    expect(await observeDespatchRecorded(event())).toBe('same')
    expect(fill).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('puts a new window on the parcel through the slot rules, emailing only in record-and-tell', async () => {
    const withTracking = parcel({ trackingNumber: '12345678901234' })
    shipments.mockResolvedValue([withTracking])
    const news = event({ change: 'update', deliveryDate: '2026-10-02', deliverySlot: ['10:00', '13:00'] })
    expect(await observeDespatchRecorded(news)).toBe('updated')
    expect(update).toHaveBeenCalledWith('s1', 'ord-1', { deliveryDate: '2026-10-02', deliverySlotStart: '10:00', deliverySlotEnd: '13:00' })
    expect(slotEmail).toHaveBeenCalled()
    expect(dayEmail).toHaveBeenCalled()

    slotEmail.mockReset()
    dayEmail.mockReset()
    mode('record')
    expect(await observeDespatchRecorded(news)).toBe('updated')
    expect(slotEmail).not.toHaveBeenCalled()
    expect(dayEmail).not.toHaveBeenCalled()
  })

  it('looks again when another announcement filled the blank parcel first, and then finds its own tracking', async () => {
    shipments
      .mockResolvedValueOnce([parcel()])
      .mockResolvedValue([parcel({ trackingNumber: '12345678901234' })])
    fill.mockResolvedValue(false)
    expect(await observeDespatchRecorded(event(), { pauseMs: 0 })).toBe('same')
  })

  it('looks again, rather than refusing, when a concurrent announcement sent the lines with this tracking a moment ago', async () => {
    // First look: no parcel. By the time it counts what is left, the other
    // run has sent it all - under this very tracking.
    shipments.mockResolvedValueOnce([]).mockResolvedValue([parcel({ trackingNumber: '12345678901234' })])
    summary.mockResolvedValue({ lines: [{ orderItemId: 'item-1', outstandingQty: 0 }] })
    expect(await observeDespatchRecorded(event(), { pauseMs: 0 })).toBe('same')
    expect(create).not.toHaveBeenCalled()
  })

  it('looks again when a concurrent announcement made the parcel under the lock', async () => {
    create.mockResolvedValueOnce({ ok: false, status: 409, error: 'That parcel is already on this order.', code: 'duplicate' })
    shipments
      .mockResolvedValueOnce([])
      .mockResolvedValue([parcel({ trackingNumber: '12345678901234' })])
    expect(await observeDespatchRecorded(event(), { pauseMs: 0 })).toBe('same')
    expect(create).toHaveBeenCalledTimes(1)
  })
})

describe('finishing a run that stopped part way', () => {
  const both = () => event({ lines: [{ sourceOrderItemId: 'item-1', qty: 1 }, { sourceOrderItemId: 'item-2', qty: 2 }] })

  it('B1: a busy order on the rest of the lines throws, so the announcement is kept', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    shipments.mockResolvedValueOnce([parcel()]).mockResolvedValue([parcel({ trackingNumber: '12345678901234' })])
    summary.mockResolvedValue({ lines: [{ orderItemId: 'item-1', outstandingQty: 0 }, { orderItemId: 'item-2', outstandingQty: 2 }] })
    create.mockResolvedValue({ ok: false, status: 409, error: 'busy', code: 'busy' })
    await expect(observeDespatchRecorded(both(), { pauseMs: 0 })).rejects.toThrow(/rest of PO-00012/)
  })

  it('B1: a run that failed after the fill is finished by the retry, the rest recorded exactly once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const filledParcel = parcel({ trackingNumber: '12345678901234' })
    shipments.mockResolvedValueOnce([parcel()]).mockResolvedValue([filledParcel])
    summary.mockResolvedValue({ lines: [{ orderItemId: 'item-1', outstandingQty: 0 }, { orderItemId: 'item-2', outstandingQty: 2 }] })
    create.mockRejectedValueOnce(new Error('the database blinked'))
    await expect(observeDespatchRecorded(both(), { pauseMs: 0 })).rejects.toThrow('the database blinked')

    // The retry finds the tracking on the order and records what is missing.
    expect(await observeDespatchRecorded(both(), { pauseMs: 0 })).toBe('same')
    const recorded = create.mock.calls.filter((call) => call[0].items.some((i: { orderItemId: string }) => i.orderItemId === 'item-2'))
    expect(recorded).toHaveLength(2) // the failed try and the one that worked
    expect(recorded[1]![0].items).toEqual([{ orderItemId: 'item-2', quantity: 2 }])

    // And once it is all there, another offer records nothing.
    create.mockClear()
    shipments.mockResolvedValue([filledParcel, parcel({ id: 's2', trackingNumber: '12345678901234', items: [{ id: 'si2', shipmentId: 's2', orderItemId: 'item-2', quantity: 2 }] as never })])
    summary.mockResolvedValue({ lines: [{ orderItemId: 'item-1', outstandingQty: 0 }, { orderItemId: 'item-2', outstandingQty: 0 }] })
    expect(await observeDespatchRecorded(both(), { pauseMs: 0 })).toBe('same')
    expect(create).not.toHaveBeenCalled()
  })

  it('N1: the status follows on a retry, and the dispatch note is not sent twice', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    follow.mockRejectedValueOnce(new Error('status change failed'))
    await expect(observeDespatchRecorded(event(), { pauseMs: 0 })).rejects.toThrow('status change failed')
    expect(dispatchEmail).toHaveBeenCalledTimes(1)

    shipments.mockResolvedValue([parcel({ trackingNumber: '12345678901234' })])
    expect(await observeDespatchRecorded(event(), { pauseMs: 0 })).toBe('same')
    // Once in the failed run, and again by the retry - which is what moves it.
    expect(follow).toHaveBeenCalledTimes(2)
    expect(follow).toHaveBeenLastCalledWith('ord-1', 'PROCESSING', 'recorded')
    expect(dispatchEmail).toHaveBeenCalledTimes(1)
  })
})

describe('later news about the same despatch', () => {
  const update = () => event({
    change: 'update',
    lines: [{ sourceOrderItemId: 'item-1', qty: 1 }, { sourceOrderItemId: 'item-2', qty: 2 }],
    deliveryDate: '2026-10-09',
  })

  it('never puts a line the owner held back onto a parcel', async () => {
    // The tracking is on a parcel holding item-1; item-2 is still to go,
    // because the owner is holding it.
    shipments.mockResolvedValue([parcel({ trackingNumber: '12345678901234' })])
    summary.mockResolvedValue({ lines: [{ orderItemId: 'item-1', outstandingQty: 0 }, { orderItemId: 'item-2', outstandingQty: 2 }] })
    expect(await observeDespatchRecorded(update())).toBe('updated')
    expect(create).not.toHaveBeenCalled()
    expect(follow).not.toHaveBeenCalled()
  })

  it('never recreates a parcel the owner deleted, nor fills a blank one', async () => {
    // The automatic parcel for item-2 was deleted; only item-1's remains.
    shipments.mockResolvedValue([parcel({ trackingNumber: '12345678901234' })])
    summary.mockResolvedValue({ lines: [{ orderItemId: 'item-1', outstandingQty: 0 }, { orderItemId: 'item-2', outstandingQty: 2 }] })
    await observeDespatchRecorded(update())
    expect(create).not.toHaveBeenCalled()
    // And with nothing carrying the tracking at all: nothing made, nothing filled.
    shipments.mockResolvedValue([parcel()])
    expect(await observeDespatchRecorded(update())).toBe('same')
    expect(create).not.toHaveBeenCalled()
    expect(fill).not.toHaveBeenCalled()
  })

  it('still finishes a new announcement that stopped part way (it comes again as new)', async () => {
    shipments.mockResolvedValue([parcel({ trackingNumber: '12345678901234' })])
    summary.mockResolvedValue({ lines: [{ orderItemId: 'item-1', outstandingQty: 0 }, { orderItemId: 'item-2', outstandingQty: 2 }] })
    await observeDespatchRecorded(event({ lines: [{ sourceOrderItemId: 'item-1', qty: 1 }, { sourceOrderItemId: 'item-2', qty: 2 }] }))
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0]![0].items).toEqual([{ orderItemId: 'item-2', quantity: 2 }])
  })
})

describe('refusals', () => {
  it('never touches a cancelled or refunded order', async () => {
    for (const status of ['CANCELLED', 'REFUNDED']) {
      order.mockResolvedValue({ id: 'ord-1', orderNumber: 'DW000001', status })
      expect(await observeDespatchRecorded(event())).toBe('refused')
    }
    expect(shipments).not.toHaveBeenCalled()
  })

  it('never overwrites tracking: lines already dispatched under other tracking are left alone', async () => {
    shipments.mockResolvedValue([parcel({ trackingNumber: '99990000111122' })])
    summary.mockResolvedValue({ lines: [{ orderItemId: 'item-1', outstandingQty: 0 }] })
    expect(await observeDespatchRecorded(event())).toBe('refused')
    expect(fill).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('ignores a despatch for anybody but shop', async () => {
    expect(await observeDespatchRecorded(event({ source: null }))).toBe('not-ours')
    expect(await observeDespatchRecorded(event({ source: { module: 'elsewhere', orderId: 'x' } }))).toBe('not-ours')
  })

  it('throws for a passing failure, so the announcer keeps it and tries again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    shipments.mockRejectedValue(new Error('the database blinked'))
    await expect(observeDespatchRecorded(event())).rejects.toThrow('the database blinked')
  })

  it('throws when the order stays busy through every retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    create.mockResolvedValue({ ok: false, status: 409, error: 'busy', code: 'busy' })
    await expect(observeDespatchRecorded(event(), { pauseMs: 0 })).rejects.toThrow(/stayed busy/)
    expect(create).toHaveBeenCalledTimes(3)
  })

  it('returns quietly for a permanent refusal', async () => {
    create.mockResolvedValue({ ok: false, status: 400, error: 'Order item not found' })
    expect(await observeDespatchRecorded(event(), { pauseMs: 0 })).toBe('refused')
  })
})

describe('the tracking in the shop’s own terms', () => {
  it('puts a DPD follow link on the DPD courier with its code', () => {
    expect(shopTrackingFor({ deliveryCouriers: COURIERS } as never, event({ carrier: null }))).toEqual({
      trackingNumber: '12345678901234',
      trackingUrl: 'https://www.dpd.co.uk/d/AbC123dEf456',
      trackingShortCode: 'AbC123dEf456',
      carrier: 'DPD',
      courierId: 'dpd',
    })
  })

  it('puts a Multidrop link on the one Multidrop courier, carrying no code', () => {
    expect(shopTrackingFor({ deliveryCouriers: COURIERS } as never, event({
      carrier: null, trackingNumber: 'F12345678901', trackingUrl: 'https://multidrop.link/Q9XZ7A/AB12DE', trackingShortCode: 'Q9XZ7A',
    }))).toEqual({
      trackingNumber: 'F12345678901', trackingUrl: 'https://multidrop.link/Q9XZ7A/AB12DE', trackingShortCode: null,
      carrier: 'Example Haulage', courierId: 'twoman',
    })
  })

  it('puts an AIT short link on the AIT courier, canonical, with no number', () => {
    const couriers = [...COURIERS, { id: 'ait', name: 'AIT', trackingSource: 'ait' }]
    expect(shopTrackingFor({ deliveryCouriers: couriers } as never, event({
      carrier: null, trackingNumber: '972140', trackingUrl: 'http://www.aithd.com/kz0vkrz?utm=sms', trackingShortCode: null,
    }))).toEqual({
      trackingNumber: null, trackingUrl: 'https://aithd.com/kz0vkrz', trackingShortCode: null,
      carrier: 'AIT', courierId: 'ait',
    })
  })

  it('keeps a parcel off the AIT courier when its link is not an AIT short link', () => {
    const couriers = [...COURIERS, { id: 'ait', name: 'AIT', trackingSource: 'ait' }]
    expect(shopTrackingFor({ deliveryCouriers: couriers } as never, event({
      carrier: 'AIT', trackingNumber: '972140', trackingUrl: null, trackingShortCode: null,
    }))).toMatchObject({ trackingNumber: '972140', courierId: null })
  })

  it('B2: never keeps a link to a host it does not know as a carrier, keeping the number', () => {
    expect(shopTrackingFor({ deliveryCouriers: COURIERS } as never, event({
      carrier: null, trackingUrl: 'https://evil.example/track/12345678901234', trackingShortCode: null,
    }))).toMatchObject({ trackingNumber: '12345678901234', trackingUrl: null, trackingShortCode: null, courierId: null })
  })

  it('keeps a DPD parcel with no follow link off the DPD courier, and refuses an unsafe link', () => {
    const tracking = shopTrackingFor({ deliveryCouriers: COURIERS } as never, event({ trackingUrl: 'javascript:alert(1)', trackingShortCode: null }))
    expect(tracking).toMatchObject({ trackingUrl: null, courierId: null, carrier: 'DPD' })
  })

  it('knows its own tracking whatever the spacing', () => {
    expect(carriesTracking(parcel({ trackingNumber: '1234 5678 901 234' }), { trackingNumber: '12345678901234', trackingUrl: null, trackingShortCode: null })).toBe(true)
    expect(carriesTracking(parcel({ trackingShortCode: 'Q9' }), { trackingNumber: null, trackingUrl: null, trackingShortCode: 'Q9' })).toBe(true)
    expect(carriesTracking(parcel(), { trackingNumber: null, trackingUrl: null, trackingShortCode: null })).toBe(false)
  })
})
