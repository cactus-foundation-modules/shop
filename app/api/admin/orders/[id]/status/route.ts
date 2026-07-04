import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getOrderById, getOrderItems, updateOrderStatus } from '@/modules/shop/lib/db/orders'
import { decrementStockOnShip } from '@/modules/shop/lib/db/products'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { sendShopEmail } from '@/modules/shop/lib/email'
import type { ShpEmailTemplateTrigger } from '@/modules/shop/lib/types'

const Body = z.object({ status: z.enum(['PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'ON_HOLD']), sendEmail: z.boolean().optional() })

const STATUS_EMAIL_TRIGGER: Partial<Record<string, ShpEmailTemplateTrigger>> = {
  PROCESSING: 'STATUS_PROCESSING',
  SHIPPED: 'STATUS_SHIPPED',
  COMPLETED: 'STATUS_COMPLETED',
  CANCELLED: 'STATUS_CANCELLED',
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.orders')
  if (gate.error) return gate.error

  const { id } = await params
  const order = await getOrderById(id)
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  await updateOrderStatus(id, parsed.data.status)

  // Pre-order items: stock decrements on ship, not on purchase (addendum B.4).
  if (parsed.data.status === 'SHIPPED') {
    const items = await getOrderItems(id)
    const preOrderItemIds = items.filter((i) => i.isPreOrder).map((i) => i.id)
    await decrementStockOnShip(preOrderItemIds)
  }

  if (parsed.data.sendEmail) {
    const trigger = STATUS_EMAIL_TRIGGER[parsed.data.status]
    if (trigger) {
      const config = await getShopConfigCached()
      await sendShopEmail(trigger, order.customerEmail, {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        shopName: config.shopTitle || 'Shop',
      }, { orderId: id })
    }
  }

  return NextResponse.json({ success: true })
}
