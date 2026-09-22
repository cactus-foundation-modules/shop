// The delivery charge as refund money: what the customer paid to have an order
// delivered, tax and all, and how much of it is still theirs to be given back.
//
// Pure, so the arithmetic is tested on its own (refund-delivery.test.ts) and the
// refund caps (lib/db/refunds.ts), the order screen and the request queue all
// read the same figure.
//
// An order stores delivery the way it stores everything else: on an INCLUSIVE
// shop `shippingAmount` already carries its VAT; on an EXCLUSIVE one it is the
// net charge and the VAT sits in the order's `taxAmount` beside the goods' own.
// So the delivery's tax is whatever the order carries over and above its lines
// - the same reading the invoice takes (lib/invoice-tax.ts), which keeps both
// tied to what was actually charged rather than to today's rate table.

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export type DeliveryOrder = { taxMode: 'INCLUSIVE' | 'EXCLUSIVE' | string; shippingAmount: string | number; taxAmount: string | number }
export type DeliveryLine = { taxAmount: string | number }
export type DeliveryRefund = { status: string; shippingAmount: string | number }

/** The VAT on the delivery charge, as it was charged. Zero on an order with no
 *  delivery charge, whatever pennies of rounding the totals leave over. */
export function deliveryTax(order: DeliveryOrder, lines: readonly DeliveryLine[]): number {
  if (!(Number(order.shippingAmount) > 0)) return 0
  const goodsTax = lines.reduce((sum, line) => sum + (Number(line.taxAmount) || 0), 0)
  return Math.max(0, round2(Number(order.taxAmount) - goodsTax))
}

/** What the customer paid for delivery, tax included. */
export function deliveryGross(order: DeliveryOrder, lines: readonly DeliveryLine[]): number {
  const shipping = Number(order.shippingAmount) || 0
  if (!(shipping > 0)) return 0
  return round2(order.taxMode === 'EXCLUSIVE' ? shipping + deliveryTax(order, lines) : shipping)
}

/**
 * How much of the delivery charge can still be refunded: what was paid for it,
 * less every refund that has already handed some back - COMPLETED ones, and
 * PENDING ones too, whose outcome is not known yet and which the refund caps
 * count as gone for the same reason (lib/db/refunds.ts).
 */
export function refundableDelivery(
  order: DeliveryOrder,
  lines: readonly DeliveryLine[],
  refunds: readonly DeliveryRefund[],
): number {
  const gone = refunds
    .filter((refund) => refund.status === 'COMPLETED' || refund.status === 'PENDING')
    .reduce((sum, refund) => sum + (Number(refund.shippingAmount) || 0), 0)
  return Math.max(0, round2(deliveryGross(order, lines) - gone))
}

/**
 * Of a refund's delivery money, how much is VAT - in the proportion the
 * delivery charge itself carried it. What a credit note and the tax report
 * both need, and never a fresh rate lookup.
 */
export function deliveryRefundTax(order: DeliveryOrder, lines: readonly DeliveryLine[], refundedGross: number): number {
  const gross = deliveryGross(order, lines)
  if (!(gross > 0) || !(refundedGross > 0)) return 0
  return round2(deliveryTax(order, lines) * Math.min(refundedGross / gross, 1))
}
