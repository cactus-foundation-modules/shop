// How many refunded units go back on the shelf. Pure, so the rule can be read
// and tested without a database; lib/db/order-stock.ts does the writing.
//
// The rule is "stock follows the goods, and never goes back twice":
//
//  - Only a NORMAL line's units ever come back. Those came off the shelf the
//    moment the order was paid for (lib/order-fulfillment.ts). A pre-order line's
//    units only come off when they are dispatched, so an undispatched pre-order
//    unit was never taken and has nothing to return - its allocation slot is
//    handed back by the refund itself instead.
//
//  - Only units that never LEFT come back. A refund for something that has been
//    dispatched - a goodwill refund, a chair that arrived broken, a return still
//    in the post - does not put a chair on the shelf, and guessing that it does
//    is how a shop sells stock it has not got. Goods that do come back are booked
//    in by hand, the same as any other delivery. A refund is taken to cover the
//    undispatched units first: they are the ones it stops being sent, which is
//    exactly how the dispatch caps in lib/db/shipments.ts read a refund too.
//
//  - Never more than the order actually took. A sale that went through with too
//    little stock took less than it ordered (the count stops at nothing), and a
//    backorder took nothing at all, so handing back the full quantity would
//    invent units. The ledger of what this order took and has already had back
//    (shp_stock_movements, reason order.paid / order.refunded) caps it.

export type RefundedLine = {
  productId: string | null
  isPreOrder: boolean
  /** Units bought on the line. */
  quantity: number
  /** refunded_qty BEFORE this refund was recorded. */
  refundedBefore: number
  /** Units on the line already recorded as dispatched. */
  dispatchedQty: number
  /** Units this refund covers on the line. */
  refundingQty: number
}

/** Units on one line this refund frees that are still in the building. */
export function unitsStillOnShelf(line: RefundedLine): number {
  if (line.isPreOrder || !line.productId) return 0
  const refunding = Math.max(Math.trunc(line.refundingQty), 0)
  const stillHere = Math.max(line.quantity - line.dispatchedQty - line.refundedBefore, 0)
  return Math.min(refunding, stillHere)
}

export type StockLedger = { taken: number; restored: number }

/**
 * Units to put back per product, capped by what the order took off the shelf
 * and has not already had back. A product with no ledger entry - an order paid
 * before the ledger was kept, or a product not keeping a count - gets nothing:
 * the safe direction for a stock count is under, never over.
 */
export function restockByProduct(
  lines: RefundedLine[],
  ledger: ReadonlyMap<string, StockLedger>,
): Map<string, number> {
  const wanted = new Map<string, number>()
  for (const line of lines) {
    const units = unitsStillOnShelf(line)
    if (units <= 0 || !line.productId) continue
    wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + units)
  }

  const plan = new Map<string, number>()
  for (const [productId, units] of wanted) {
    const entry = ledger.get(productId)
    const owed = entry ? Math.max(entry.taken - entry.restored, 0) : 0
    const back = Math.min(units, owed)
    if (back > 0) plan.set(productId, back)
  }
  return plan
}
