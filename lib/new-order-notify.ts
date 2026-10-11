import { upsertAlert } from '@/lib/notifications/alerts'
import { formatMoney } from '@/modules/shop/lib/money'
import type { ShpConfig } from '@/modules/shop/lib/config'
import type { ShpOrder } from '@/modules/shop/lib/types'

// One notification per new order in the core admin bell, which is also what the
// admin's browser alert (components/admin/NotificationBell.tsx) is built from.
//
// Keyed by the order, so the two moments an order can announce itself - placed
// on a method that is cleared by hand, and paid for - land on the one entry
// instead of two. Best-effort and never throws: an order that cannot be
// announced is still an order, and this runs at the end of a payment webhook.

export async function notifyAdminNewOrder(
  order: Pick<ShpOrder, 'id' | 'orderNumber' | 'customerName' | 'total'>,
  config: Pick<ShpConfig, 'currencySymbol'>,
  state: 'paid' | 'awaiting-payment',
): Promise<void> {
  try {
    const total = formatMoney(order.total, config.currencySymbol)
    const who = order.customerName?.trim()
    await upsertAlert({
      type: 'message',
      dedupeKey: `shop:order:${order.id}`,
      title: `New order ${order.orderNumber}${state === 'awaiting-payment' ? ' (awaiting payment)' : ''} - ${total}${who ? ` from ${who}` : ''}`,
      link: `/m/shop/orders/${order.id}`,
      actionLabel: 'View order',
    })
  } catch (error) {
    console.error('[shop] could not raise the new-order notification', order.id, error)
  }
}
