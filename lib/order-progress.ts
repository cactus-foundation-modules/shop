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
  key: 'placed' | 'paid' | 'dispatched' | 'delivery' | 'complete'
  label: string
  state: OrderStepState
  /** When it happened, where the order records a moment for it. Null on a step
   *  that has not happened, and on "Complete", which has no timestamp of its
   *  own - the status is the only record that it did. */
  at: Date | null
  /** A word of detail under the label, for the step in progress. */
  note: string | null
  /** Delivery step only: how far through the booked window the day has got, 0
   *  to 1, so the van can sit where the clock says rather than in the middle of
   *  its column. Null everywhere else. */
  progress?: number | null
}

/**
 * A booked delivery, ready to be shown as its own step.
 *
 * The caller works this out - it needs the shop's timezone and the clock, and
 * this file is deliberately pure - and hands over only what the rail prints.
 * See lib/delivery-slot.ts.
 */
export type OrderDelivery = {
  /** 'Tuesday 8th of September', already worded. */
  day: string
  /** 'between 10:00 and 13:00', or '' where the courier has not said yet. */
  window: string
  /** 0 to 1 across the booked window. */
  progress: number
  /** The window has been and gone. Not the same as the order being complete:
   *  somebody still has to confirm that it actually turned up. */
  arrived: boolean
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
  /** The delivery a courier has booked in, where one has been. Adds a fifth
   *  step between Dispatched and Complete; without it the rail is the four
   *  steps it has always been. */
  delivery?: OrderDelivery | null
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
  const { order, lines, lastShippedAt, delivery } = input
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

  // The booked delivery is its own step, and only exists once a courier has
  // given a day. A rail that grows a step the customer has seen before is fine;
  // one that invents a step nobody has been promised is not, so no delivery
  // booked means the same four steps this page has always shown.
  //
  // Arrived is not complete. The window passing means the van has been, which
  // is a different fact from the order being finished - a delivery can fail, and
  // ticking Complete off a clock would tell somebody standing in an empty hall
  // that their furniture is there.
  const arrived = Boolean(delivery?.arrived) || complete

  const done: Record<OrderStep['key'], boolean> = { placed: true, paid, dispatched, delivery: arrived, complete }
  const keys: OrderStep['key'][] = delivery
    ? ['placed', 'paid', 'dispatched', 'delivery', 'complete']
    : ['placed', 'paid', 'dispatched', 'complete']
  const labels: Record<OrderStep['key'], string> = {
    placed: 'Ordered',
    paid: 'Paid',
    dispatched: 'Dispatched',
    delivery: arrived ? 'Delivery' : 'Out for delivery',
    complete: 'Complete',
  }
  const at: Record<OrderStep['key'], Date | null> = {
    placed: order.createdAt,
    paid: order.paidAt,
    dispatched: lastShippedAt,
    // The day is a calendar day, not a moment, so it is printed as the step's
    // note rather than being turned into a timestamp the page would then format
    // in a timezone and get wrong by one day. See lib/delivery-slot.ts.
    delivery: null,
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
        // The booked day, and the window on it once the courier has confirmed
        // one. Shown whatever state the step is in: "when is it coming" is the
        // question, and it does not stop being the question because the van has
        // not set off yet.
        : key === 'delivery' && delivery
          ? [delivery.day, delivery.window].filter(Boolean).join(', ')
          : null,
      progress: key === 'delivery' && delivery ? delivery.progress : null,
    }
  })
}
