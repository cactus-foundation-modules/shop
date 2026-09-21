import { describe, it, expect, vi, beforeEach } from 'vitest'

// applyOrderPaymentState's merge: a provider restates its own field by label and
// its own data by key, and nothing else on the line moves. Mocked at the three
// doors it reads and writes through, since the merge IS the thing under test.
const executeRaw = vi.fn(async (..._args: unknown[]) => 1)
vi.mock('@/lib/db/prisma', () => ({ prisma: { $executeRaw: (...args: unknown[]) => executeRaw(...args) } }))
vi.mock('@/modules/shop/lib/line-meta', () => ({ gatherCartExtensionPoint: vi.fn() }))
vi.mock('@/modules/shop/lib/db/orders', () => ({ getOrderById: vi.fn(), getOrderItems: vi.fn() }))

import { gatherCartExtensionPoint } from '@/modules/shop/lib/line-meta'
import { getOrderById, getOrderItems } from '@/modules/shop/lib/db/orders'
import { applyOrderPaymentState, type OrderPaymentStateProvider } from '@/modules/shop/lib/order-payment-state'
import type { LineMeta, ShpOrder, ShpOrderItem } from '@/modules/shop/lib/types'

const ORDER = { id: 'o1', orderNumber: 'DW1', paymentStatus: 'PAID' } as ShpOrder
const item = (lineMeta: LineMeta) => ({ id: 'i1', orderId: 'o1', lineMeta }) as ShpOrderItem

// The line_meta a call to $executeRaw wrote, parsed back.
function written(call: number): LineMeta {
  return JSON.parse(executeRaw.mock.calls[call]![1] as string) as LineMeta
}

beforeEach(() => {
  executeRaw.mockClear()
  vi.mocked(getOrderById).mockResolvedValue(ORDER)
})

describe('applyOrderPaymentState', () => {
  it("merges a provider's data by key, leaving another module's alone", async () => {
    vi.mocked(getOrderItems).mockResolvedValue([item({
      fields: [{ label: 'Colour', value: 'Red' }, { label: 'Delivery', value: '5 working days' }],
      data: { mine: { targetDate: '2026-09-23' }, theirs: { colour: 'red' } },
    })])
    const provider: OrderPaymentStateProvider = () => ({ items: [{
      itemId: 'i1',
      fields: [{ label: 'Delivery', value: 'by Friday' }],
      data: { mine: { targetDate: '2026-09-23', paidTargetDate: '2026-09-25' } },
    }] })
    vi.mocked(gatherCartExtensionPoint).mockResolvedValue([provider])

    await applyOrderPaymentState('o1')

    expect(executeRaw).toHaveBeenCalledTimes(1)
    expect(written(0)).toEqual({
      fields: [{ label: 'Colour', value: 'Red' }, { label: 'Delivery', value: 'by Friday' }],
      data: { mine: { targetDate: '2026-09-23', paidTargetDate: '2026-09-25' }, theirs: { colour: 'red' } },
    })
  })

  it('writes a change to data alone, even where the wording already stands', async () => {
    vi.mocked(getOrderItems).mockResolvedValue([item({
      fields: [{ label: 'Delivery', value: 'by Friday' }],
      data: { mine: { targetDate: '2026-09-23' } },
    })])
    vi.mocked(gatherCartExtensionPoint).mockResolvedValue([() => ({ items: [{
      itemId: 'i1',
      fields: [{ label: 'Delivery', value: 'by Friday' }],
      data: { mine: { targetDate: '2026-09-23', paidTargetDate: '2026-09-25' } },
    }] })])

    await applyOrderPaymentState('o1')

    expect(executeRaw).toHaveBeenCalledTimes(1)
    expect(written(0).data).toEqual({ mine: { targetDate: '2026-09-23', paidTargetDate: '2026-09-25' } })
  })

  it('writes nothing when neither the wording nor the data would change', async () => {
    const meta: LineMeta = { fields: [{ label: 'Delivery', value: 'by Friday' }], data: { mine: { paidTargetDate: '2026-09-25' } } }
    vi.mocked(getOrderItems).mockResolvedValue([item(meta)])
    vi.mocked(gatherCartExtensionPoint).mockResolvedValue([() => ({ items: [{
      itemId: 'i1',
      fields: [{ label: 'Delivery', value: 'by Friday' }],
      data: { mine: { paidTargetDate: '2026-09-25' } },
    }] })])

    await applyOrderPaymentState('o1')

    expect(executeRaw).not.toHaveBeenCalled()
  })
})
