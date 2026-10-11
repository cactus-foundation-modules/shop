import { beforeEach, describe, expect, it, vi } from 'vitest'

const getOrderById = vi.fn()
const applyOrderStatusChange = vi.fn()

vi.mock('@/modules/shop/lib/db/orders', () => ({ getOrderById: (id: string) => getOrderById(id) }))
vi.mock('@/modules/shop/lib/order-status', () => ({
  applyOrderStatusChange: (input: unknown) => applyOrderStatusChange(input),
}))

import { observePurchaseOrderSent } from './purchase-order-sent-observer'

const event = { purchaseOrderNumber: 'PO-1', source: { module: 'shop' as const, orderId: 'o1' } }

describe('observePurchaseOrderSent', () => {
  beforeEach(() => {
    getOrderById.mockReset()
    applyOrderStatusChange.mockReset()
    applyOrderStatusChange.mockResolvedValue({ ok: true, changed: true })
  })

  it('moves a PROCESSING order to PREPARING and emails once', async () => {
    getOrderById.mockResolvedValue({ id: 'o1', status: 'PROCESSING' })
    expect(await observePurchaseOrderSent(event)).toBe('moved')
    expect(applyOrderStatusChange).toHaveBeenCalledWith({
      orderId: 'o1', status: 'PREPARING', sendEmail: true, emailOnlyIfChanged: true,
    })
  })

  it.each(['PENDING', 'PREPARING', 'ON_HOLD', 'SHIPPED', 'COMPLETED', 'CANCELLED'])('leaves a %s order alone', async (status) => {
    getOrderById.mockResolvedValue({ id: 'o1', status })
    expect(await observePurchaseOrderSent(event)).toBe('ignored')
    expect(applyOrderStatusChange).not.toHaveBeenCalled()
  })

  it('ignores a purchase order not raised for a shop order', async () => {
    expect(await observePurchaseOrderSent({ purchaseOrderNumber: 'PO-2', source: null })).toBe('ignored')
    expect(getOrderById).not.toHaveBeenCalled()
  })
})
