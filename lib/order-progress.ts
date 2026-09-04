import type { ShpOrder, ShpOrderItem } from '@/modules/shop/lib/types'

// Where an order has got to, as four steps a customer recognises.
//
// It is derived every time it is shown rather than stored, for the same reason
// the dispatch summary is: ShpOrderStatus is a fixed list the shop's own staff
// move an order through, and "has it been sent" is a fact about the lines. An
// order can sit at PROCESSING with every line out of the door because nobody
// pressed the button, and the customer is not interested in that distinction.
//
// Pure, and it takes only what it reads, so the order page can hand it what it
// already has in memory rather than going back to the database.

export type OrderStepState = 'done' | 'now' | 'todo'

export type OrderStep = {
  key: 'placed' | 'paid' | 'dispatched' | 'complete'
  label: string
  state: OrderStepState
  /** When it happened, where the order records a moment for it. Null on a step
   *  that has not happened, and on "Complete", which has no timestamp of its
   *  own - the status is the only record that it did. */
  at: Date | null
  /** A word of detail under the label, for the step in progress. */
  note: string | null
}

type ProgressLine = {
  item: Pick<ShpOrderItem, 'quantity'>
  dispatchedQty: number
}

export type OrderProgressInput = {
  order: Pick<ShpOrder, 'status' | 'paymentStatus' | 'paidAt' | 'createdAt'>
  lines: readonly ProgressLine[]
  /** The latest parcel out, where any have gone. */
  lastShippedAt: Date | null
}

/** An order that stopped rather than finished. The rail is the wrong shape for
 *  it - there is no next step - so the page says so in a sentence instead. */
export function orderStopped(status: ShpOrder['status']): boolean {
  return status === 'CANCELLED' || status === 'REFUNDED'
}

/**
 * The four steps, each marked done, in progress, or still to come.
 *
 * Everything before the first unfinished step is done, that step is the one in
 * progress, and everything after it is to come - so the rail can never show a
 * finished step after an unfinished one, whatever combination of status and
 * payment state an order has got itself into.
 *
 * Empty for a cancelled or refunded order: see orderStopped.
 */
export function orderProgressSteps(input: OrderProgressInput): OrderStep[] {
  const { order, lines, lastShippedAt } = input
  if (orderStopped(order.status)) return []

  const paid = Boolean(order.paidAt)
    || order.paymentStatus === 'PAID'
    || order.paymentStatus === 'PARTIALLY_REFUNDED'
    || order.paymentStatus === 'REFUNDED'

  const ordered = lines.reduce((sum, line) => sum + line.item.quantity, 0)
  const sent = lines.reduce((sum, line) => sum + Math.min(line.dispatchedQty, line.item.quantity), 0)
  // SHIPPED and COMPLETED are the shop saying so out loud, and they win over
  // the line count: a digital order has nothing to dispatch and would otherwise
  // sit for ever at a step it can never pass.
  const dispatched = order.status === 'SHIPPED' || order.status === 'COMPLETED'
    || (ordered > 0 && sent >= ordered)
  const complete = order.status === 'COMPLETED'

  const done: Record<OrderStep['key'], boolean> = { placed: true, paid, dispatched, complete }
  const keys: OrderStep['key'][] = ['placed', 'paid', 'dispatched', 'complete']
  const labels: Record<OrderStep['key'], string> = {
    placed: 'Ordered',
    paid: 'Paid',
    dispatched: 'Dispatched',
    complete: 'Complete',
  }
  const at: Record<OrderStep['key'], Date | null> = {
    placed: order.createdAt,
    paid: order.paidAt,
    dispatched: lastShippedAt,
    complete: null,
  }

  const firstUnfinished = keys.findIndex((key) => !done[key])
  return keys.map((key, index) => {
    const state: OrderStepState = firstUnfinished === -1 || index < firstUnfinished
      ? 'done'
      : index === firstUnfinished ? 'now' : 'todo'
    return {
      key,
      label: labels[key],
      state,
      at: state === 'done' ? at[key] : key === 'dispatched' && sent > 0 ? at[key] : null,
      // Part of an order gone out is the one thing the rail cannot show by
      // shape, and it is exactly what somebody with half a delivery is here to
      // find out.
      note: key === 'dispatched' && state === 'now' && sent > 0 && ordered > 0
        ? `${sent} of ${ordered} sent`
        : null,
    }
  })
}
