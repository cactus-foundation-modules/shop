import { describe, expect, it, vi, beforeEach } from 'vitest'
import { sendCourierContactEmail } from '@/modules/shop/lib/courier-contact-email'
import { getShipmentsForOrder } from '@/modules/shop/lib/db/shipments'
import { getOrderById } from '@/modules/shop/lib/db/orders'
import { notifyOrderCustomer } from '@/modules/shop/lib/order-notify'
import { shopEmailTemplates } from '@/modules/shop/lib/email-templates'

vi.mock('@/modules/shop/lib/db/shipments', () => ({ getShipmentsForOrder: vi.fn() }))
vi.mock('@/modules/shop/lib/db/orders', () => ({ getOrderById: vi.fn() }))
vi.mock('@/modules/shop/lib/order-notify', () => ({ notifyOrderCustomer: vi.fn() }))
vi.mock('@/modules/shop/lib/delivery-slot-email', () => ({
  parcelEmailVars: vi.fn(async () => ({ orderNumber: 'DW000001', parcelItems: '<table></table>', hasParcelItems: 'true', shopName: 'Test Shop' })),
}))
vi.mock('@/modules/shop/lib/config', () => ({
  getShopConfigCached: vi.fn(async () => ({
    shopTitle: 'Test Shop',
    deliveryCouriers: [{
      id: 'cou_furdeco',
      name: 'Furdeco',
      rearrangeChatUrl: 'https://chat.example/arrange',
      rearrangePhone: '0121 000 0000',
    }],
  })),
}))

const order = { id: 'ord_1', orderNumber: 'DW000001', customerName: 'Sam' }
const flagged = {
  id: 'shp_1',
  orderId: 'ord_1',
  courierId: 'cou_furdeco',
  carrier: 'Furdeco',
  trackingNumber: 'F123',
  courierContactAt: new Date('2026-09-08T09:00:00Z') as Date | null,
  quietCustomerEmails: false,
}

describe('sendCourierContactEmail', () => {
  beforeEach(() => {
    vi.mocked(getOrderById).mockReset().mockResolvedValue(order as never)
    vi.mocked(getShipmentsForOrder).mockReset().mockResolvedValue([flagged] as never)
    vi.mocked(notifyOrderCustomer).mockReset()
  })

  it('sends the courier\'s chat, phone and the tracking number', async () => {
    expect(await sendCourierContactEmail({ orderId: 'ord_1', shipmentId: 'shp_1' })).toBe(true)
    const [trigger, , vars] = vi.mocked(notifyOrderCustomer).mock.calls[0] as unknown as [string, unknown, Record<string, string>]
    expect(trigger).toBe('COURIER_CONTACT')
    expect(vars).toMatchObject({
      carrier: 'Furdeco',
      contactChatUrl: 'https://chat.example/arrange',
      hasContactChat: 'true',
      contactPhone: '0121 000 0000',
      contactPhoneDial: '01210000000',
      hasContactPhone: 'true',
      trackingNumber: 'F123',
      hasTrackingNumber: 'true',
    })
  })

  it('sends nothing for a parcel nobody flagged', async () => {
    vi.mocked(getShipmentsForOrder).mockResolvedValue([{ ...flagged, courierContactAt: null }] as never)
    expect(await sendCourierContactEmail({ orderId: 'ord_1', shipmentId: 'shp_1' })).toBe(false)
    expect(notifyOrderCustomer).not.toHaveBeenCalled()
  })

  it('sends nothing for a quiet parcel', async () => {
    vi.mocked(getShipmentsForOrder).mockResolvedValue([{ ...flagged, quietCustomerEmails: true }] as never)
    expect(await sendCourierContactEmail({ orderId: 'ord_1', shipmentId: 'shp_1' })).toBe(false)
    expect(notifyOrderCustomer).not.toHaveBeenCalled()
  })

  it('ships a template for the trigger it sends', () => {
    expect(shopEmailTemplates.some((t) => t.key === 'shop.courier-contact')).toBe(true)
  })
})
