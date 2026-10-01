import { beforeEach, describe, expect, it, vi } from 'vitest'

// A quiet parcel (migration 068: recorded from a supplier's tracking while the
// shop was set to "record only") tells the customer nothing - by any path. The
// four emails that can follow from a parcel without anybody pressing anything
// (a window the courier confirmed, a failed delivery, tracking that arrived
// late, the dispatch note) and the completion email are each checked here.

const order = vi.hoisted(() => vi.fn())
const shipments = vi.hoisted(() => vi.fn())
const notify = vi.hoisted(() => vi.fn())
const claimSlot = vi.hoisted(() => vi.fn())
const claimFailed = vi.hoisted(() => vi.fn())
const statusChange = vi.hoisted(() => vi.fn())
const quietOrder = vi.hoisted(() => vi.fn())

vi.mock('@/modules/shop/lib/db/orders', () => ({ getOrderById: order }))
vi.mock('@/modules/shop/lib/db/shipments', () => ({
  getShipmentsForOrder: shipments,
  getOrderDispatchSummary: vi.fn(async () => ({ fullyDispatched: true, lines: [] })),
  allShipmentsDelivered: vi.fn(async () => true),
  orderHasQuietShipment: quietOrder,
  claimSlotNotification: claimSlot,
  claimFailedDeliveryNotification: claimFailed,
  claimTrackingNotification: vi.fn(async () => true),
}))
vi.mock('@/modules/shop/lib/order-notify', () => ({ notifyOrderCustomer: notify }))
vi.mock('@/modules/shop/lib/order-status', () => ({
  applyOrderStatusChange: statusChange,
  dispatchDetails: vi.fn(),
  orderStatusEmailVars: vi.fn(),
}))
vi.mock('@/modules/shop/lib/config', () => ({ getShopConfigCached: vi.fn(async () => ({ deliveryCouriers: [] })) }))

const quiet = {
  id: 's1', orderId: 'ord-1', items: [{ id: 'i', shipmentId: 's1', orderItemId: 'item-1', quantity: 1 }],
  trackingNumber: '12345678901234', trackingUrl: null, trackingShortCode: null, carrier: 'DPD', courierId: null,
  deliveryDate: '2026-10-06', deliverySlotStart: '10:00', deliverySlotEnd: '13:00', deliveryWindowFrom: null,
  deliveryWindowTo: null, slotNotifiedAt: null, trackingNotifiedAt: null, quietCustomerEmails: true,
}

beforeEach(() => {
  for (const mock of [order, shipments, notify, claimSlot, claimFailed, statusChange, quietOrder]) mock.mockReset()
  order.mockResolvedValue({ id: 'ord-1', orderNumber: 'DW000001', status: 'SHIPPED', kind: 'NORMAL' })
  shipments.mockResolvedValue([quiet])
  claimSlot.mockResolvedValue(true)
  claimFailed.mockResolvedValue(true)
  statusChange.mockResolvedValue({ ok: true, changed: true })
})

describe('a quiet parcel', () => {
  it('sends no window email, and takes no once-only stamp, when the courier confirms a window', async () => {
    const { maybeSendCarrierWindowEmail, sendDeliverySlotEmail, sendDeliveryDayEmail } = await import('./delivery-slot-email')
    const told = await maybeSendCarrierWindowEmail(
      { ...quiet, deliveryDate: null, deliverySlotStart: null, deliverySlotEnd: null },
      { windowFrom: new Date('2026-10-06T09:00:00Z'), windowTo: new Date('2026-10-06T12:00:00Z') },
      'Europe/London',
    )
    expect(told).toBe(false)
    expect(claimSlot).not.toHaveBeenCalled()
    await sendDeliverySlotEmail({ orderId: 'ord-1', shipmentId: 's1', timezone: 'Europe/London' })
    await sendDeliveryDayEmail({ orderId: 'ord-1', shipmentId: 's1' })
    expect(notify).not.toHaveBeenCalled()
  })

  it('sends no failed delivery email, and leaves its claim alone', async () => {
    const { maybeSendFailedDeliveryEmail, sendFailedDeliveryEmail } = await import('./failed-delivery-email')
    expect(await maybeSendFailedDeliveryEmail(quiet)).toBe(false)
    expect(claimFailed).not.toHaveBeenCalled()
    await sendFailedDeliveryEmail({ orderId: 'ord-1', shipmentId: 's1' })
    expect(notify).not.toHaveBeenCalled()
  })

  it('sends no "here is your tracking" email and no dispatch note', async () => {
    const { sendTrackingAddedEmail } = await import('./tracking-added-email')
    const { sendShipmentDispatchedEmail } = await import('./shipment-email')
    await sendTrackingAddedEmail({ orderId: 'ord-1', shipmentId: 's1' })
    await sendShipmentDispatchedEmail({ orderId: 'ord-1', shipmentId: 's1' })
    expect(notify).not.toHaveBeenCalled()
  })

  it('lets the order complete when it lands, without the completion email', async () => {
    const { completeOrderIfEveryParcelArrived } = await import('./order-auto-complete')
    quietOrder.mockResolvedValue(true)
    expect(await completeOrderIfEveryParcelArrived('ord-1')).toBe(true)
    expect(statusChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'COMPLETED', sendEmail: false }))
    // An order with no quiet parcel still gets its email.
    quietOrder.mockResolvedValue(false)
    await completeOrderIfEveryParcelArrived('ord-1')
    expect(statusChange).toHaveBeenLastCalledWith(expect.objectContaining({ sendEmail: true }))
  })

  it('stays quiet through the order screen’s own window and tracking emails', async () => {
    const { maybeSendSlotEmail, maybeSendTrackingEmail } = await import('./dispatch-follow-up')
    expect(await maybeSendSlotEmail('ord-1', quiet as never, true)).toBe(false)
    expect(await maybeSendTrackingEmail('ord-1', { ...quiet, trackingNumber: null } as never, quiet as never, true)).toBe(false)
    expect(claimSlot).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })
})
