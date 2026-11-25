import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { OrderDeliveryChangedObserver } from '@/modules/shop/lib/order-delivery-hooks'

const gather = vi.hoisted(() => vi.fn())

vi.mock('@/modules/shop/lib/line-meta', () => ({
  gatherCartExtensionPoint: gather,
}))

const { notifyOrderDeliveryChanged } = await import('@/modules/shop/lib/order-delivery-hooks')

const event = { orderId: 'ord_1', orderNumber: 'SO-1001', addressChanged: true, instructionsChanged: false }

beforeEach(() => {
  gather.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('notifyOrderDeliveryChanged', () => {
  it('announces nothing when neither the address nor the instructions changed', async () => {
    await notifyOrderDeliveryChanged({ ...event, addressChanged: false })
    expect(gather).not.toHaveBeenCalled()
  })

  it('asks for the shop.order-delivery-changed point and hands every observer the event in order', async () => {
    const seen: string[] = []
    const first: OrderDeliveryChangedObserver = (e) => {
      seen.push(`first:${e.orderNumber}`)
    }
    const second: OrderDeliveryChangedObserver = (e) => {
      seen.push(`second:${String(e.addressChanged)}`)
    }
    gather.mockResolvedValue([first, second])

    await notifyOrderDeliveryChanged(event)
    expect(gather).toHaveBeenCalledWith('shop.order-delivery-changed')
    expect(seen).toEqual(['first:SO-1001', 'second:true'])
  })

  it('lets the next observer run after one throws', async () => {
    const ran = vi.fn()
    gather.mockResolvedValue([
      () => {
        throw new Error('boom')
      },
      ran,
    ])
    await expect(notifyOrderDeliveryChanged(event)).resolves.toBeUndefined()
    expect(ran).toHaveBeenCalledWith(event)
  })

  it('swallows a failure to gather observers', async () => {
    gather.mockRejectedValue(new Error('no manifests'))
    await expect(notifyOrderDeliveryChanged(event)).resolves.toBeUndefined()
  })
})
