import { netOffReturnCharge, type RefundLine } from '@/modules/shop/lib/return-charge'
import { requestRefundLines, withinRemaining, type RefundableLine, type RefundableOrder } from '@/modules/shop/lib/request-refund-lines'
import { refundableDelivery, type DeliveryLine, type DeliveryOrder, type DeliveryRefund } from '@/modules/shop/lib/refund-delivery'

// The arithmetic behind a redelivery charge on an order (lib/order-charges.ts).
//
// Pure and apart from the file that moves the money, for the reason
// lib/return-charge.ts is: a penny wrong here is a penny wrong on somebody's
// bank statement, and it deserves testing on its own rather than reasoning
// about inside a function that also talks to a payment provider.

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** The most a single charge may be. Well past any real fee, and short of the
 *  NUMERIC(10,2) column's ceiling. */
export const MAX_CHARGE_NET = 100_000

export type ChargeFigures = { net: number; taxRate: number; tax: number; total: number }

/**
 * A fee as typed (before tax) and the tax rate to add, as the three figures the
 * customer is shown: £39.00 + £7.80 VAT = £46.80.
 *
 * Always entered before tax, whatever the shop's own pricing mode. A courier
 * quotes "£39 plus VAT", and asking the owner to work the gross out first is
 * how a £46.80 fee becomes £46.79.
 */
export function chargeFigures(net: number, taxRate: number): { ok: true; figures: ChargeFigures } | { ok: false; error: string } {
  if (!Number.isFinite(net) || net <= 0) return { ok: false, error: 'Enter the amount to charge.' }
  if (net > MAX_CHARGE_NET) return { ok: false, error: 'That is rather a lot for one charge. Check the amount.' }
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return { ok: false, error: 'The tax rate must be between 0 and 100.' }
  const netRounded = round2(net)
  const tax = round2((netRounded * taxRate) / 100)
  return { ok: true, figures: { net: netRounded, taxRate, tax, total: round2(netRounded + tax) } }
}

export type CancellationFigures = { net: number; tax: number; total: number }

export type RedeliveryFigures = {
  /** The redelivery fee: what the customer pays to have it sent again, and
   *  what is kept back if they cancel instead. */
  fee: ChargeFigures
  /** Kept back on top of the fee, and only if they cancel. All zero where the
   *  shop does not charge for cancelling. */
  cancellation: CancellationFigures
}

/**
 * The redelivery fee and the cancellation charge, both typed before tax and
 * both taxed at the one rate. The fee is required; the cancellation charge may
 * be nothing at all.
 */
export function redeliveryFigures(
  feeNet: number,
  cancellationNet: number,
  taxRate: number,
): { ok: true; figures: RedeliveryFigures } | { ok: false; error: string } {
  const fee = chargeFigures(feeNet, taxRate)
  if (!fee.ok) return fee
  if (!Number.isFinite(cancellationNet) || cancellationNet < 0) {
    return { ok: false, error: 'The cancellation charge must be nothing, or an amount.' }
  }
  if (cancellationNet > MAX_CHARGE_NET) return { ok: false, error: 'That is rather a lot for a cancellation charge. Check the amount.' }
  const net = round2(cancellationNet)
  const tax = round2((net * taxRate) / 100)
  return { ok: true, figures: { fee: fee.figures, cancellation: { net, tax, total: round2(net + tax) } } }
}

/** Everything kept back if the customer cancels instead of paying: the
 *  redelivery fee, which is owed either way, and any cancellation charge. */
export function keptOnCancellation(charge: { total: string | number; cancellationTotal: string | number }): number {
  return round2(Number(charge.total) + Number(charge.cancellationTotal))
}

/**
 * The tax rate a new charge starts at, as a percentage: the highest rate on
 * the order's own lines. An extra fee on a delivery follows the goods being
 * delivered, and on a shop that sells at one rate this is simply that rate. The
 * owner can change it before raising the charge.
 *
 * A line stores its rate as a fraction (0.2000 for 20%) and a charge stores a
 * percentage, because the owner types one in - hence the hundred.
 */
export function suggestedChargeTaxRate(lines: ReadonlyArray<{ taxRate: string | number }>): number {
  const highest = lines.reduce((best, line) => {
    const rate = Number(line.taxRate)
    return Number.isFinite(rate) && rate > best ? rate : best
  }, 0)
  return Math.round(highest * 100 * 1000) / 1000
}

export type CancellationRefundInput = {
  order: RefundableOrder & DeliveryOrder & { total: string | number }
  items: ReadonlyArray<RefundableLine & DeliveryLine>
  refunds: ReadonlyArray<DeliveryRefund & { amount: string | number }>
  /** Everything being kept back, tax included - the redelivery fee and any
   *  cancellation charge (keptOnCancellation). */
  fee: number
}

export type CancellationRefundPlan =
  | {
      ok: true
      lines: RefundLine[]
      /** Delivery handed back with it, tax included. */
      delivery: number
      /** What goes back to the customer. */
      refund: number
      /** What the order still holds of theirs before this refund. */
      held: number
      /** The fee actually kept. */
      kept: number
    }
  | { ok: false; error: string }

/**
 * What cancelling an order and keeping a charge back out of the refund sends
 * back: everything not already refunded - every unit, and whatever of the
 * delivery charge is left - less the fee.
 *
 * Every unit, including ones already on a van. This is the customer calling
 * the whole thing off after a delivery that did not happen, not a
 * cancellation of goods still on the shelf, so the refund covers the order and
 * getting the goods back from the courier is the shop's business.
 *
 * The fee comes off the goods lines pro rata (netOffReturnCharge), so every
 * line on the credit note stays recognisably itself and the fee is what is left
 * standing on the invoice - tax and all, at the goods' own rate.
 */
export function cancellationRefundPlan(input: CancellationRefundInput): CancellationRefundPlan {
  const gone = input.refunds
    .filter((refund) => refund.status === 'COMPLETED' || refund.status === 'PENDING')
    .reduce((sum, refund) => sum + Number(refund.amount), 0)
  const held = round2(Number(input.order.total) - gone)
  if (!(held > 0)) return { ok: false, error: 'There is nothing left to refund on this order.' }

  const fee = round2(input.fee)
  if (fee + 0.005 >= held) {
    return { ok: false, error: 'The charges are as much as everything left on the order, so there would be nothing to refund.' }
  }

  const delivery = Math.min(refundableDelivery(input.order, input.items, input.refunds), held)
  // Everything not yet refunded, at what the customer paid for it, kept inside
  // what the order still holds once the delivery has been counted.
  const lines = withinRemaining(requestRefundLines({ items: [] }, input.items, input.order), held - delivery)
  const netted = netOffReturnCharge(lines, fee)
  if (!netted.ok) {
    return { ok: false, error: 'The charges are as much as the goods on the order, so there would be nothing to refund for them.' }
  }

  return {
    ok: true,
    lines: netted.lines,
    delivery: round2(delivery),
    refund: round2(netted.total + delivery),
    held,
    kept: netted.charge,
  }
}
