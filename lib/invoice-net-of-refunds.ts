import type { ShpOrder, ShpOrderItem } from '@/modules/shop/lib/types'

// Taking money that already went back off an order BEFORE it is invoiced.
//
// The ordinary case is the other way round: an order is invoiced, something is
// refunded afterwards, and a credit note undoes the part of the sale that was
// handed back. Two documents, both correct, and the books net them off.
//
// This file is for the case where the refund came FIRST - the order was still
// being picked, a line went out of stock, the money went back, and only then did
// the order reach whatever the shop invoices on. There is nothing to credit
// there, because nothing was ever invoiced. What must not happen is the invoice
// going out for the whole basket anyway: the customer would be handed a VAT
// invoice for goods they never received and never paid for, and the shop would
// declare output tax on money it had already returned.
//
// So: the invoice is raised net of those refunds, and the refund is either
// netted off here or credited by a credit note - never both, and never neither.
// Which of the two applies is decided by the caller (see
// lib/db/refunds.ts listUncreditedRefundLines), on one rule: a refund with a
// credit note against it has already been dealt with.
//
// Everything below is pure arithmetic on figures the order already carries, so
// it can be tested without a database. Two rules decide it:
//
//  1. The money is the money that actually moved. What comes off a line is what
//     the refund row says went back, not a fresh calculation of what those units
//     "should" have been worth - the customer's statement and the shop's bank
//     both show the refund, and an invoice that disagrees with either is a
//     dispute rather than a document.
//
//  2. Nothing is invented. An order with no refunds against it comes back
//     untouched, object for object, so the overwhelming majority of invoices are
//     built from exactly the figures they were built from before this existed.

/** One line of a settled refund, as the refund row recorded it. `amount` is the
 *  money handed back for those units, tax and all. */
export type NettableRefundLine = { orderItemId: string; quantity: number; amount: number }

export type OrderNetOfRefunds = {
  order: ShpOrder
  items: ShpOrderItem[]
  /** What came off, for the caller that wants to say so. Zero when nothing did. */
  refundedTotal: string
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function money(value: number): string {
  return round2(value).toFixed(2)
}

/**
 * The order and its lines as they stand once already-refunded units are taken
 * off, ready to be invoiced.
 *
 * Returns the order and items unchanged when there is nothing to take off,
 * which is the common case and deliberately a no-op rather than a recomputation
 * that agrees to the penny by luck.
 */
export function netOrderOfRefunds(
  order: ShpOrder,
  items: ShpOrderItem[],
  refunded: NettableRefundLine[],
): OrderNetOfRefunds {
  if (refunded.length === 0) return { order, items, refundedTotal: '0.00' }

  // Several refunds can touch the same line - a unit this week, another the
  // week after - so they are summed per line before anything is worked out.
  const perLine = new Map<string, { quantity: number; amount: number }>()
  for (const line of refunded) {
    const seen = perLine.get(line.orderItemId) ?? { quantity: 0, amount: 0 }
    seen.quantity += Number(line.quantity) || 0
    seen.amount += Number(line.amount) || 0
    perLine.set(line.orderItemId, seen)
  }

  const inclusive = order.taxMode === 'INCLUSIVE'
  // A basket discount is spread across the lines by value, which is what
  // resolveOrderTotals did when the tax was worked out in the first place (see
  // buildInvoiceMoney). So the money a line actually cost is its share of it,
  // not the figure in its own total column.
  const subtotalBefore = Number(order.subtotal) || 0
  const discountRatio = subtotalBefore > 0 ? Math.min((Number(order.discountAmount) || 0) / subtotalBefore, 1) : 0

  // The tax on delivery is whatever the order carries over and above its goods'.
  // Worked out from the ORIGINAL lines, because delivery is not refundable line
  // by line and must survive untouched - the customer was charged for carriage
  // and it was not handed back.
  const goodsTaxBefore = items.reduce((sum, item) => sum + (Number(item.taxAmount) || 0), 0)
  const deliveryTax = Math.max(0, round2(Number(order.taxAmount) - goodsTaxBefore))

  const kept: ShpOrderItem[] = []
  let refundedTotal = 0
  let subtotal = 0
  let goodsTax = 0

  for (const item of items) {
    const off = perLine.get(item.id)
    if (!off) {
      kept.push(item)
      subtotal += Number(item.total) || 0
      goodsTax += Number(item.taxAmount) || 0
      continue
    }

    // What this line actually cost the customer, discount and tax and all. On an
    // EXCLUSIVE shop the line's `total` is its NET value with the tax beside it;
    // on an INCLUSIVE one the tax is already inside. Refund amounts are recorded
    // tax-inclusive either way (see prepareRefund), so this is the figure they
    // have to be taken off.
    const chargedGross = (Number(item.total) || 0) * (1 - discountRatio) + (inclusive ? 0 : Number(item.taxAmount) || 0)
    const takenGross = Math.min(off.amount, chargedGross)
    refundedTotal += takenGross
    const remainingGross = round2(chargedGross - takenGross)

    // Nothing of this line is left to invoice. Dropped rather than printed at
    // nothing: a zero line on a VAT invoice invites the question of what was
    // supplied, and the answer is that this one was not.
    if (remainingGross <= 0) continue

    // The rest of the line, scaled by the money still owed on it. Every column
    // moves together, so the line still reads as quantity times price on the
    // ordinary whole-unit refund, and the tax stays at the rate it was SOLD at
    // rather than being re-derived from a table that may have moved since.
    const scale = chargedGross > 0 ? remainingGross / chargedGross : 0
    const total = round2((Number(item.total) || 0) * scale)
    const taxAmount = round2((Number(item.taxAmount) || 0) * scale)

    subtotal += total
    goodsTax += taxAmount

    kept.push({
      ...item,
      // Units not refunded. Can be nought where somebody handed back part of the
      // money for every unit - a goodwill deduction rather than a return - and
      // it prints that way on purpose: no goods went out, and the money kept is
      // still money the shop has to declare.
      quantity: Math.max(0, item.quantity - off.quantity),
      total: money(total),
      taxAmount: money(taxAmount),
      // The refund is now on the invoice's face rather than outstanding against
      // it, so nothing here is owed back any more.
      refundedQty: 0,
    })
  }

  // Removing lines removes their share of the discount too, so it is scaled by
  // what is left of the goods. That keeps the proportion the tax was worked out
  // on at checkout exactly where it was.
  const keptRatio = subtotalBefore > 0 ? Math.min(round2(subtotal) / subtotalBefore, 1) : 0
  const discountAmount = round2((Number(order.discountAmount) || 0) * keptRatio)
  const shippingAmount = Number(order.shippingAmount) || 0
  const taxAmount = round2(goodsTax + deliveryTax)
  const total = round2(round2(subtotal) - discountAmount + shippingAmount + (inclusive ? 0 : taxAmount))

  return {
    items: kept,
    order: {
      ...order,
      subtotal: money(subtotal),
      discountAmount: money(discountAmount),
      shippingAmount: money(shippingAmount),
      taxAmount: money(taxAmount),
      total: money(total),
    },
    refundedTotal: money(refundedTotal),
  }
}
