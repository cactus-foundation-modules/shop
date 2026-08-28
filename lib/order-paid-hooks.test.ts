import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { OrderPaidObserver } from '@/modules/shop/lib/order-paid-hooks'

// The whole point of this seam is that it cannot hurt anybody. It runs at the
// end of a payment webhook, after the money is in and the customer has been
// emailed, so the only behaviour worth pinning is what happens when a module
// misbehaves - and the answer has to be "nothing, to anyone else".

const gather = vi.hoisted(() => vi.fn())

vi.mock('@/modules/shop/lib/line-meta', () => ({
  gatherCartExtensionPoint: gather,
}))

const { notifyOrderPaid } = await import('@/modules/shop/lib/order-paid-hooks')

const event = {
  orderId: 'ord_1',
  orderNumber: 'SO-1001',
  paymentMethod: 'card',
  clearedManually: false,
}

beforeEach(() => {
  gather.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('notifyOrderPaid', () => {
  it('does nothing at all on a site with no observers', async () => {
    gather.mockResolvedValue([])
    await expect(notifyOrderPaid(event)).resolves.toBeUndefined()
  })

  it('hands every observer the same event, in manifest order', async () => {
    const seen: string[] = []
    const first: OrderPaidObserver = (e) => {
      seen.push(`first:${e.orderNumber}`)
    }
    const second: OrderPaidObserver = (e) => {
      seen.push(`second:${e.orderId}`)
    }
    gather.mockResolvedValue([first, second])

    await notifyOrderPaid(event)
    expect(seen).toEqual(['first:SO-1001', 'second:ord_1'])
  })

  it('awaits an observer that returns a promise', async () => {
    let finished = false
    gather.mockResolvedValue([
      async () => {
        await Promise.resolve()
        finished = true
      },
    ])

    await notifyOrderPaid(event)
    expect(finished).toBe(true)
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

    await expect(notifyOrderPaid(event)).resolves.toBeUndefined()
    expect(reached, 'a broken observer must not stop the next one').toBe(true)
  })

  it('does not reject when an async observer rejects either', async () => {
    gather.mockResolvedValue([async () => Promise.reject(new Error('timed out'))])
    await expect(notifyOrderPaid(event)).resolves.toBeUndefined()
  })

  it('says which order it was, so the log is worth reading', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    gather.mockResolvedValue([
      () => {
        throw new Error('nope')
      },
    ])

    await notifyOrderPaid(event)
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('SO-1001'), expect.any(Error))
  })
})
