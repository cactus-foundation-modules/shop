import { describe, expect, it, vi, beforeEach } from 'vitest'
import { maybeSendFailedDeliveryEmail } from '@/modules/shop/lib/failed-delivery-email'
import { claimFailedDeliveryNotification, getShipmentsForOrder } from '@/modules/shop/lib/db/shipments'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { shopEmailTemplates } from '@/modules/shop/lib/email-templates'

vi.mock('@/modules/shop/lib/db/shipments', () => ({
  claimFailedDeliveryNotification: vi.fn(),
  getShipmentsForOrder: vi.fn(),
}))
vi.mock('@/modules/shop/lib/db/orders', () => ({ getOrderById: vi.fn() }))
vi.mock('@/modules/shop/lib/order-notify', () => ({ notifyOrderCustomer: vi.fn() }))
vi.mock('@/modules/shop/lib/config', () => ({
  getShopConfigCached: vi.fn(async () => ({
    shopTitle: 'Test Shop',
    deliveryCouriers: [{
      id: 'cou_furdeco',
      name: 'Furdeco',
      rearrangeChatUrl: 'https://chat.example/rebook',
      rearrangePhone: '0121 000 0000',
    }],
  })),
}))

const order = { id: 'ord_1', orderNumber: 'DW000001', customerName: 'Sam' }
const shipment = {
  id: 'shp_1',
  orderId: 'ord_1',
  courierId: 'cou_furdeco',
  carrier: 'Furdeco',
  trackingNumber: 'F123',
  courierRearrangingAt: null as Date | null,
}

function sentVars(): Record<string, string> {
  const call = vi.mocked(notifyOrderCustomer).mock.calls[0]
  expect(call?.[0]).toBe('DELIVERY_FAILED')
  return call?.[2] as Record<string, string>
}

describe('maybeSendFailedDeliveryEmail', () => {
  beforeEach(() => {
    vi.mocked(claimFailedDeliveryNotification).mockReset().mockResolvedValue(true)
    vi.mocked(getOrderById).mockReset().mockResolvedValue(order as never)
    vi.mocked(getShipmentsForOrder).mockReset().mockResolvedValue([shipment] as never)
    vi.mocked(notifyOrderCustomer).mockReset()
  })

  it('sends nothing when this failure has already been told', async () => {
    vi.mocked(claimFailedDeliveryNotification).mockResolvedValue(false)
    expect(await maybeSendFailedDeliveryEmail({ id: 'shp_1', orderId: 'ord_1' })).toBe(false)
    expect(notifyOrderCustomer).not.toHaveBeenCalled()
  })

  it('tells the customer how to reach the courier, with the tracking number', async () => {
    expect(await maybeSendFailedDeliveryEmail({ id: 'shp_1', orderId: 'ord_1' })).toBe(true)
    expect(sentVars()).toMatchObject({
      carrier: 'Furdeco',
      trackingNumber: 'F123',
      rebookChatUrl: 'https://chat.example/rebook',
      rebookPhone: '0121 000 0000',
      rebookPhoneDial: '01210000000',
      hasContactCourier: 'true',
      hasCourierWillContact: 'false',
    })
  })

  it('tells them to wait once staff say the courier will call', async () => {
    vi.mocked(getShipmentsForOrder).mockResolvedValue([
      { ...shipment, courierRearrangingAt: new Date('2026-09-25T11:00:00Z') },
    ] as never)
    await maybeSendFailedDeliveryEmail({ id: 'shp_1', orderId: 'ord_1' })
    expect(sentVars()).toMatchObject({
      hasContactCourier: 'false',
      hasCourierWillContact: 'true',
      hasRebookChat: 'false',
      hasRebookPhone: 'false',
    })
  })

  it('passes only tags the template declares', async () => {
    await maybeSendFailedDeliveryEmail({ id: 'shp_1', orderId: 'ord_1' })
    const template = shopEmailTemplates.find((t) => t.key === 'shop.delivery-failed')
    expect(template).toBeDefined()
    for (const tag of Object.keys(sentVars())) expect(template?.mergeTags, tag).toContain(tag)
  })
})
