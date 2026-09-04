import { describe, expect, it } from 'vitest'
import { netOrderOfRefunds } from '@/modules/shop/lib/invoice-net-of-refunds'
import { buildInvoiceMoney } from '@/modules/shop/lib/invoice-tax'
import type { ShpOrder, ShpOrderItem } from '@/modules/shop/lib/types'

// The arithmetic of invoicing an order that has already had money handed back.
// Everything here is about one question: does the document add up to what the
// customer actually kept and paid for, and does it stay out of the way entirely
// when nothing was refunded.

function item(over: Partial<ShpOrderItem> & Pick<ShpOrderItem, 'id'>): ShpOrderItem {
  return {
    orderId: 'o1',
    productId: null,
    productName: 'Chair',
    productSku: 'CH-1',
    productType: 'PHYSICAL',
    quantity: 1,
    unitPrice: '100.00',
    taxRate: '0.2',
    taxAmount: '20.00',
    total: '100.00',
    refundedQty: 0,
    isPreOrder: false,
    preOrderDispatchDate: null,
    lineMeta: null,
    ...over,
  } as ShpOrderItem
}

function order(over: Partial<ShpOrder> = {}): ShpOrder {
  return {
    id: 'o1',
    orderNumber: 'ORD-1',
    taxMode: 'EXCLUSIVE',
    currency: 'GBP',
    subtotal: '200.00',
    discountAmount: '0.00',
    shippingAmount: '0.00',
    taxAmount: '40.00',
    total: '240.00',
    ...over,
  } as ShpOrder
}

describe('netOrderOfRefunds', () => {
  it('leaves an order with no refunds exactly as it was', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' })]
    const source = order()
    const net = netOrderOfRefunds(source, items, [])
    expect(net.order).toBe(source)
    expect(net.items).toBe(items)
    expect(net.refundedTotal).toBe('0.00')
  })

  it('drops a line refunded in full and takes its money and tax with it', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' })]
    // £100 net plus £20 VAT went back on line b.
    const net = netOrderOfRefunds(order(), items, [{ orderItemId: 'b', quantity: 1, amount: 120 }])

    expect(net.items.map((line) => line.id)).toEqual(['a'])
    expect(net.order.subtotal).toBe('100.00')
    expect(net.order.taxAmount).toBe('20.00')
    expect(net.order.total).toBe('120.00')
    expect(net.refundedTotal).toBe('120.00')
  })

  it('takes refunded units off a multi-unit line and keeps the rest', () => {
    const items = [item({ id: 'a', quantity: 3, total: '300.00', taxAmount: '60.00' })]
    const source = order({ subtotal: '300.00', taxAmount: '60.00', total: '360.00' })
    const net = netOrderOfRefunds(source, items, [{ orderItemId: 'a', quantity: 1, amount: 120 }])

    expect(net.items).toHaveLength(1)
    expect(net.items[0]!.quantity).toBe(2)
    expect(net.items[0]!.total).toBe('200.00')
    expect(net.items[0]!.taxAmount).toBe('40.00')
    expect(net.order.total).toBe('240.00')
  })

  it('keeps delivery and its tax, which no refund line touched', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' })]
    // £10 delivery plus £2 VAT on top of the goods' £40.
    const source = order({ shippingAmount: '10.00', taxAmount: '42.00', total: '252.00' })
    const net = netOrderOfRefunds(source, items, [{ orderItemId: 'b', quantity: 1, amount: 120 }])

    expect(net.order.shippingAmount).toBe('10.00')
    // £20 on the surviving line, plus the £2 delivery carried.
    expect(net.order.taxAmount).toBe('22.00')
    expect(net.order.total).toBe('132.00')
  })

  it('handles an inclusive shop, where the tax is already inside the line', () => {
    const items = [
      item({ id: 'a', unitPrice: '120.00', total: '120.00', taxAmount: '20.00' }),
      item({ id: 'b', unitPrice: '120.00', total: '120.00', taxAmount: '20.00' }),
    ]
    const source = order({ taxMode: 'INCLUSIVE', subtotal: '240.00', taxAmount: '40.00', total: '240.00' })
    const net = netOrderOfRefunds(source, items, [{ orderItemId: 'b', quantity: 1, amount: 120 }])

    expect(net.items.map((line) => line.id)).toEqual(['a'])
    expect(net.order.subtotal).toBe('120.00')
    expect(net.order.taxAmount).toBe('20.00')
    expect(net.order.total).toBe('120.00')
  })

  it('scales a basket discount by what is left of the goods', () => {
    // A tenth off the basket, so each £100 line was charged at £90 plus £18 VAT
    // - and £108 is what goes back when one of them is refunded.
    const items = [item({ id: 'a', taxAmount: '18.00' }), item({ id: 'b', taxAmount: '18.00' })]
    const source = order({ discountAmount: '20.00', taxAmount: '36.00', total: '216.00' })
    const net = netOrderOfRefunds(source, items, [{ orderItemId: 'b', quantity: 1, amount: 108 }])

    expect(net.items.map((line) => line.id)).toEqual(['a'])
    expect(net.order.subtotal).toBe('100.00')
    expect(net.order.discountAmount).toBe('10.00')
    expect(net.order.taxAmount).toBe('18.00')
    expect(net.order.total).toBe('108.00')
  })

  it('keeps money retained on a line whose units all went back', () => {
    // Every unit returned, but a tenner held back. Nothing was supplied and the
    // money is still the shop's, so it stays on the invoice.
    const items = [item({ id: 'a' })]
    const source = order({ subtotal: '100.00', taxAmount: '20.00', total: '120.00' })
    const net = netOrderOfRefunds(source, items, [{ orderItemId: 'a', quantity: 1, amount: 110 }])

    expect(net.items).toHaveLength(1)
    expect(net.items[0]!.quantity).toBe(0)
    expect(net.order.total).toBe('10.00')
  })

  it('never gives back more than the line was worth', () => {
    const items = [item({ id: 'a' })]
    const source = order({ subtotal: '100.00', taxAmount: '20.00', total: '120.00' })
    const net = netOrderOfRefunds(source, items, [{ orderItemId: 'a', quantity: 1, amount: 500 }])

    expect(net.items).toHaveLength(0)
    expect(net.order.total).toBe('0.00')
    expect(net.refundedTotal).toBe('120.00')
  })

  it('sums several refunds against the same line', () => {
    const items = [item({ id: 'a', quantity: 3, total: '300.00', taxAmount: '60.00' })]
    const source = order({ subtotal: '300.00', taxAmount: '60.00', total: '360.00' })
    const net = netOrderOfRefunds(source, items, [
      { orderItemId: 'a', quantity: 1, amount: 120 },
      { orderItemId: 'a', quantity: 1, amount: 120 },
    ])

    expect(net.items[0]!.quantity).toBe(1)
    expect(net.order.total).toBe('120.00')
  })

  it('produces a rate summary that ties to the netted total', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' })]
    const source = order({ shippingAmount: '10.00', taxAmount: '42.00', total: '252.00' })
    const net = netOrderOfRefunds(source, items, [{ orderItemId: 'b', quantity: 1, amount: 120 }])

    const { taxBreakdown } = buildInvoiceMoney(net.order, net.items)
    const gross = taxBreakdown.reduce((sum, row) => sum + Number(row.gross), 0)
    const tax = taxBreakdown.reduce((sum, row) => sum + Number(row.tax), 0)
    expect(gross.toFixed(2)).toBe(net.order.total)
    expect(tax.toFixed(2)).toBe(net.order.taxAmount)
  })
})
