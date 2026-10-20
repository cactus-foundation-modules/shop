import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { OrderCompletedObserver } from '@/modules/shop/lib/order-completed-hooks'

// Same shape as order-paid-hooks.test.ts: the only behaviour worth pinning is
// that a misbehaving module cannot hurt the person completing the order.

const gather = vi.hoisted(() => vi.fn())

vi.mock('@/modules/shop/lib/line-meta', () => ({
  gatherCartExtensionPoint: gather,
}))

const { notifyOrderCompleted } = await import('@/modules/shop/lib/order-completed-hooks')

const event = { orderId: 'ord_1', orderNumber: 'SO-1001' }

beforeEach(() => {
  gather.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('notifyOrderCompleted', () => {
  it('does nothing at all on a site with no observers', async () => {
    gather.mockResolvedValue([])
    await expect(notifyOrderCompleted(event)).resolves.toBeUndefined()
  })

  it('asks for the shop.order-completed point and hands every observer the event in order', async () => {
    const seen: string[] = []
    const first: OrderCompletedObserver = (e) => {
      seen.push(`first:${e.orderNumber}`)
    }
    const second: OrderCompletedObserver = (e) => {
      seen.push(`second:${e.orderId}`)
    }
    gather.mockResolvedValue([first, second])

    await notifyOrderCompleted(event)
    expect(gather).toHaveBeenCalledWith('shop.order-completed')
    expect(seen).toEqual(['first:SO-1001', 'second:ord_1'])
  })

  it('carries on when one observer throws, and never rejects', async () => {
    let reached = false
    gather.mockResolvedValue([
      () => {
        throw new Error('purchasing is having a bad day')
      },
      () => {
        reached = true
      },
    ])
    await expect(notifyOrderCompleted(event)).resolves.toBeUndefined()
    expect(reached).toBe(true)
  })

  it('does not reject when the observers cannot even be gathered', async () => {
    gather.mockRejectedValue(new Error('registry missing'))
    await expect(notifyOrderCompleted(event)).resolves.toBeUndefined()
  })
})
