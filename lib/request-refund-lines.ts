import type { RefundLine } from '@/modules/shop/lib/return-charge'

// What approving a cancellation or a return actually sends back, line by line.
//
// Kept dependency-free and apart from lib/order-request-actions.ts, for the same
// reason lib/return-charge.ts is: it is money, and the arithmetic deserves to be
// tested on its own rather than reasoned about inside a function that also
// talks to a payment provider.

type TaxMode = 'INCLUSIVE' | 'EXCLUSIVE'

/** The money columns of one order line, as the order stores them. */
export type RefundableLine = {
  id: string
  quantity: number
  refundedQty: number
  unitPrice: string
  total: string
  taxAmount: string
}

/** The order-level figures that decide what a line was actually paid at. */
export type RefundableOrder = {
  taxMode: TaxMode
  subtotal: string
  discountAmount: string
}

function round2(n: number): number {
  return Number(n.toFixed(2))
}

/**
 * What one unit of a line actually cost the customer.
 *
 * Two things stand between the unit price and that figure, and both used to be
 * missed:
 *
 *  - VAT, on an EXCLUSIVE shop. There a line's `total` is its NET value and the
 *    tax sits beside it in `taxAmount`, so refunding at the unit price handed
 *    back four fifths of the money and kept the VAT. On an INCLUSIVE shop the
 *    tax is already inside `total` and nothing is added.
 *  - An order-level discount. The checkout spreads a coupon across the lines by
 *    value (resolveOrderTotals), and works each line's tax out on what is left
 *    after it - so the stored tax is already the discounted figure, and only the
 *    goods half needs the discount taking off. Refunding the undiscounted price
 *    hands back more than was paid, which the refund caps then refuse outright.
 *
 * Never more than lib/db/refunds.ts allows for the same units: that cap is the
 * line's gross figure before any discount, and this is that or less.
 */
export function paidPerUnit(line: Pick<RefundableLine, 'quantity' | 'unitPrice' | 'total' | 'taxAmount'>, order: RefundableOrder): number {
  const subtotal = Number(order.subtotal)
  const discount = Number(order.discountAmount)
  const discountRatio = subtotal > 0 && discount > 0 ? Math.min(discount / subtotal, 1) : 0
  if (line.quantity <= 0) return Number(line.unitPrice) * (1 - discountRatio)
  const goods = Number(line.total) * (1 - discountRatio)
  const tax = order.taxMode === 'EXCLUSIVE' ? Number(line.taxAmount) : 0
  return (goods + tax) / line.quantity
}

/**
 * The lines a request's refund covers: exactly the ones it names, or - on a
 * request that names none, which is what a whole-order cancellation is -
 * everything not already refunded. Each priced at what the customer paid for
 * those units (see paidPerUnit), which is the same money the order screen's
 * refund modal would send for them.
 */
export function requestRefundLines(
  request: { items: ReadonlyArray<{ orderItemId: string; quantity: number }> },
  orderItems: ReadonlyArray<RefundableLine>,
  order: RefundableOrder,
): RefundLine[] {
  const wanted = request.items.length === 0
    ? orderItems.map((item) => ({ orderItemId: item.id, quantity: item.quantity - item.refundedQty }))
    : request.items.map((line) => ({ orderItemId: line.orderItemId, quantity: line.quantity }))

  const byId = new Map(orderItems.map((item) => [item.id, item]))
  return wanted
    .filter((line) => line.quantity > 0)
    .map((line) => {
      const item = byId.get(line.orderItemId)
      return {
        orderItemId: line.orderItemId,
        quantity: line.quantity,
        amount: item ? round2(paidPerUnit(item, order) * line.quantity) : 0,
      }
    })
}

/**
 * Keeps a set of refund lines inside what is left of the money the order took.
 *
 * Only ever bites by pennies in practice. Each line's tax is stored rounded, the
 * order's tax total is rounded once over the lot, and a whole-order refund on a
 * shop that charged nothing for delivery can come out a penny or two over the
 * order total - which lib/db/refunds.ts then refuses, turning the right refund
 * into no refund at all. The excess comes off the largest line, the only place a
 * penny can go without being noticed, and moves on to the next largest only if
 * that one runs out.
 *
 * A remaining figure of zero or less is left for the refund caps to refuse in
 * their own words rather than turned into a refund of nothing here.
 */
export function withinRemaining(lines: RefundLine[], remaining: number): RefundLine[] {
  const total = round2(lines.reduce((sum, line) => sum + line.amount, 0))
  const ceiling = round2(remaining)
  if (ceiling <= 0 || total <= ceiling) return lines

  let excess = round2(total - ceiling)
  const out = lines.map((line) => ({ ...line }))
  // Largest first, and the first of any tie - deterministic, so the same
  // approval twice cannot produce two different sets of line amounts.
  const order = out
    .map((line, index) => ({ index, amount: line.amount }))
    .sort((a, b) => b.amount - a.amount || a.index - b.index)
  for (const { index } of order) {
    if (excess <= 0) break
    const line = out[index]!
    const taken = Math.min(line.amount, excess)
    line.amount = round2(line.amount - taken)
    excess = round2(excess - taken)
  }
  return out
}
