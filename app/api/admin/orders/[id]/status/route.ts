import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById, getOrderItems, outstandingPreOrderItems, releasePreOrderAllocationForOrder, updateOrderStatus } from '@/modules/shop/lib/db/orders'
import { createShipment, getOrderDispatchSummary } from '@/modules/shop/lib/db/shipments'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { sendShopEmail } from '@/modules/shop/lib/email'
import type { ShpEmailTemplateTrigger, ShpOrderItem } from '@/modules/shop/lib/types'

const Body = z.object({ status: z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'ON_HOLD']), sendEmail: z.boolean().optional() })

const STATUS_EMAIL_TRIGGER: Partial<Record<string, ShpEmailTemplateTrigger>> = {
  PROCESSING: 'STATUS_PROCESSING',
  SHIPPED: 'STATUS_SHIPPED',
  COMPLETED: 'STATUS_COMPLETED',
  CANCELLED: 'STATUS_CANCELLED',
}

function holdAllMessage(outstanding: ShpOrderItem[]): string {
  const count = outstanding.length
  const noun = count === 1 ? '1 item is' : `${count} items are`
  // Latest known date first - that is the one the whole order has to wait for.
  const latest = outstanding
    .map((i) => i.preOrderDispatchDate)
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime())[0]
  const when = latest
    ? `${count === 1 ? 'expected' : 'the last of them expected'} on ${latest.toLocaleDateString('en-GB')}`
    : 'with no expected date yet'
  return (
    `Your shop is set to hold the whole order until every item is in stock, so this one cannot be marked as dispatched yet. ` +
    `${noun} still on pre-order, ${when}. ` +
    `Once the stock has arrived, take those products off pre-order and try again - or change the mixed basket setting to offer split shipping.`
  )
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const config = await getShopConfigCached()

  // HOLD_ALL is a dispatch policy, not a checkout restriction - a mixed basket
  // is always purchasable (see the note in the payment-intent route). The policy
  // bites here instead: the whole order goes out in one piece, so it cannot be
  // marked dispatched while any pre-order line is still waiting on stock.
  // PROMPT_SPLIT means the opposite by design, so it never refuses; real
  // part-dispatch is being built separately.
  if (parsed.data.status === 'SHIPPED' && config.preOrderMixedCartBehaviour === 'HOLD_ALL') {
    const outstanding = await outstandingPreOrderItems(await getOrderItems(id))
    if (outstanding.length > 0) {
      return NextResponse.json({ error: holdAllMessage(outstanding) }, { status: 409 })
    }
  }

  const changed = await updateOrderStatus(id, parsed.data.status)

  // Everything below is a once-per-transition side effect, so it hangs off
  // `changed`. Re-sending a status the order already has must be a no-op:
  // SHIPPED -> COMPLETED -> SHIPPED used to decrement the pre-order stock a
  // second time, and decrementStockOnShip clamps at zero rather than erroring,
  // so the shop silently undercounted.
  if (changed) {
    // Pre-order items: stock decrements on ship, not on purchase (addendum B.4).
    //
    // That decrement now lives in createShipment, so it happens per parcel rather
    // than all at once. An owner who never touches the dispatch screen and simply
    // flips the order to SHIPPED still has to end up with correct stock, so this
    // records an implicit shipment covering whatever is still outstanding - which
    // routes back through the one decrement path instead of being a second one.
    //
    // Anything already dispatched is excluded by outstandingQty, so a partly
    // dispatched order that is then flipped to SHIPPED decrements only the
    // remainder. If nothing is outstanding there is no parcel to record.
    if (parsed.data.status === 'SHIPPED') {
      const summary = await getOrderDispatchSummary(id)
      const remaining = summary.lines
        .filter((l) => l.outstandingQty > 0)
        .map((l) => ({ orderItemId: l.orderItemId, quantity: l.outstandingQty }))
      if (remaining.length > 0) {
        const recorded = await createShipment({
          orderId: id,
          items: remaining,
          notes: 'Recorded automatically when the order was marked as dispatched.',
        })
        if (!recorded.ok) {
          console.error('[shop] could not record the implicit shipment for order', id, recorded.error)
        }
      }
    }

    // Cancelling hands the pre-order allocation back, so the slot can be sold
    // again instead of being held by an order that is never going to happen.
    if (parsed.data.status === 'CANCELLED') {
      await releasePreOrderAllocationForOrder(id)
    }
  }

  if (parsed.data.sendEmail) {
    const trigger = STATUS_EMAIL_TRIGGER[parsed.data.status]
    if (trigger) {
      await sendShopEmail(trigger, order.customerEmail, {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        shopName: config.shopTitle || 'Shop',
      }, { orderId: id })
    }
  }

  return NextResponse.json({ success: true })
}
