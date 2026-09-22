import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ApplyOrderStatusResult } from '@/modules/shop/lib/order-status'
import type { ShpOrderStatus } from '@/modules/shop/lib/types'

// Finishing an order off once its parcels have landed. The reads and the status
// change are mocked, so what is asserted is the decision: which orders get
// completed, and that the automatic path only emails when it moved the order.

const state: { status: ShpOrderStatus | null; everyParcelIn: boolean; fullyDispatched: boolean } = {
  status: 'SHIPPED',
  everyParcelIn: true,
  fullyDispatched: true,
}
const applyOrderStatusChange = vi.fn(async (_input: unknown): Promise<ApplyOrderStatusResult> => ({ ok: true, changed: true }))

vi.mock('@/modules/shop/lib/db/orders', () => ({
  getOrderById: async (id: string) => (state.status ? { id, status: state.status } : null),
}))
vi.mock('@/modules/shop/lib/db/shipments', () => ({
  allShipmentsDelivered: async () => state.everyParcelIn,
  getOrderDispatchSummary: async () => ({ fullyDispatched: state.fullyDispatched }),
}))
vi.mock('@/modules/shop/lib/order-status', () => ({
  applyOrderStatusChange: (input: unknown) => applyOrderStatusChange(input),
}))

const { completeOrderIfEveryParcelArrived } = await import('@/modules/shop/lib/order-auto-complete')

describe('completeOrderIfEveryParcelArrived', () => {
  beforeEach(() => {
    state.status = 'SHIPPED'
    state.everyParcelIn = true
    state.fullyDispatched = true
    applyOrderStatusChange.mockClear()
    applyOrderStatusChange.mockImplementation(async () => ({ ok: true, changed: true }))
  })

  it('completes a dispatched order whose every parcel has arrived, emailing only on the change', async () => {
    await expect(completeOrderIfEveryParcelArrived('o1')).resolves.toBe(true)
    expect(applyOrderStatusChange).toHaveBeenCalledWith({
      orderId: 'o1',
      status: 'COMPLETED',
      sendEmail: true,
      emailOnlyIfChanged: true,
    })
  })

  it('leaves an order open while a parcel is still out', async () => {
    state.everyParcelIn = false
    await expect(completeOrderIfEveryParcelArrived('o1')).resolves.toBe(false)
    expect(applyOrderStatusChange).not.toHaveBeenCalled()
  })

  // The only parcel has landed, but two items are still waiting for stock.
  it('leaves an order open while something is still owed', async () => {
    state.fullyDispatched = false
    await expect(completeOrderIfEveryParcelArrived('o1')).resolves.toBe(false)
    expect(applyOrderStatusChange).not.toHaveBeenCalled()
  })

  it.each(['COMPLETED', 'CANCELLED', 'REFUNDED', 'ON_HOLD'] as const)('never touches a %s order', async (status) => {
    state.status = status
    await expect(completeOrderIfEveryParcelArrived('o1')).resolves.toBe(false)
    expect(applyOrderStatusChange).not.toHaveBeenCalled()
  })

  it('does nothing for an order that no longer exists', async () => {
    state.status = null
    await expect(completeOrderIfEveryParcelArrived('o1')).resolves.toBe(false)
    expect(applyOrderStatusChange).not.toHaveBeenCalled()
  })

  // The hourly job and a customer's open order page reaching it together: the
  // one that lost the race reports no completion.
  it('reports false when another caller had already moved it', async () => {
    applyOrderStatusChange.mockImplementation(async () => ({ ok: true, changed: false }))
    await expect(completeOrderIfEveryParcelArrived('o1')).resolves.toBe(false)
  })
})
