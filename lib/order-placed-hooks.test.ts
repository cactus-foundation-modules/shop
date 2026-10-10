import { describe, expect, it, vi, beforeEach } from 'vitest'

// Runs at the end of a shopper's checkout, so the only behaviour worth pinning
// is that a misbehaving module cannot turn a placed order into an error.

const gather = vi.hoisted(() => vi.fn())

vi.mock('@/modules/shop/lib/line-meta', () => ({
  gatherCartExtensionPoint: gather,
}))

const { notifyOrderPlacedUnpaid } = await import('@/modules/shop/lib/order-placed-hooks')

const event = { orderId: 'ord_1', orderNumber: 'SO-1001', paymentMethod: 'BANK_TRANSFER' }

beforeEach(() => {
  gather.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('notifyOrderPlacedUnpaid', () => {
  it('does nothing at all on a site with no observers', async () => {
    gather.mockResolvedValue([])
    await expect(notifyOrderPlacedUnpaid(event)).resolves.toBeUndefined()
  })

  it('hands every observer the event, in manifest order', async () => {
    const seen: string[] = []
    gather.mockResolvedValue([
      (e: typeof event) => { seen.push(`first:${e.orderNumber}`) },
      async (e: typeof event) => { await Promise.resolve(); seen.push(`second:${e.orderId}`) },
    ])
    await notifyOrderPlacedUnpaid(event)
    expect(seen).toEqual(['first:SO-1001', 'second:ord_1'])
  })

  it('carries on when one observer throws, and never rejects', async () => {
    let reached = false
    gather.mockResolvedValue([
      () => { throw new Error('the address book is having a bad day') },
      () => { reached = true },
    ])
    await expect(notifyOrderPlacedUnpaid(event)).resolves.toBeUndefined()
    expect(reached).toBe(true)
  })

  it('does not reject when the observers cannot even be gathered', async () => {
    gather.mockRejectedValue(new Error('manifest unreadable'))
    await expect(notifyOrderPlacedUnpaid(event)).resolves.toBeUndefined()
  })
})
