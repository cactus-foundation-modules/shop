import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { recordStockMovement } from '@/modules/shop/lib/db/stock-movements'
import { ORDER_LOCK_NAMESPACE } from '@/modules/shop/lib/db/shipments'
import { restockByProduct, type RefundedLine, type StockLedger } from '@/modules/shop/lib/refund-stock'
import type { StockShortfall } from '@/modules/shop/lib/order-attention'
import { notifyProductsSaved } from '@/modules/shop/lib/product-saved'

// The two stock moves an ORDER makes on a normal line, and the ledger that
// keeps them honest with each other.
//
//   paid     -> the ordered units come off (takeStockForPaidOrder)
//   refunded -> the units that never left come back (restockRefundedUnits)
//
// Pre-order lines are not here: their units come off when they are dispatched,
// in createShipment (lib/db/shipments.ts), and a refunded pre-order unit hands
// back its allocation slot rather than stock.
//
// Both moves write a row to shp_stock_movements, referenced by order number.
// The payment row records what the count was and what it became, and that is
// the point of it: a sale made with too little stock left (a backorder, or two
// shoppers paying for the last one) takes less than it ordered, because the
// count stops at nothing, and a refund must only ever hand back what was
// actually taken. Without the record a refund on a backordered line would put
// units on the shelf that were never there.
//
// Orders paid before this ledger was kept have no payment row, so their refunds
// put nothing back - the same as before, and the safe direction for a count.
//
// Both moves announce themselves on `shop.product-saved` once they have
// committed (lib/product-saved.ts). Neither goes through updateProduct, so
// without that a module keeping a price or an availability in step with the
// shop would never hear about the one moment that matters most - the last one
// selling.

const PAID_REASON = 'order.paid'
const REFUNDED_REASON = 'order.refunded'

/**
 * Take a paid order's normal lines off the shelf, and say which products did
 * not have enough to cover it on a shop that will not sell beyond its stock.
 *
 * One transaction with the product rows locked, in id order so two orders
 * paying at the same moment queue rather than deadlock. The count still stops
 * at nothing rather than going below - the rest of the shop reads a negative
 * count nowhere - but a shortfall is now reported instead of disappearing into
 * the clamp.
 */
export async function takeStockForPaidOrder(orderNumber: string, orderItemIds: string[]): Promise<StockShortfall[]> {
  if (orderItemIds.length === 0) return []
  // Filled inside the transaction, announced after it commits - see the call to
  // notifyProductsSaved at the bottom.
  const moved: string[] = []
  const shortfalls = await prisma.$transaction(
    async (tx): Promise<StockShortfall[]> => {
      // Summed per product first: a personalised basket may carry two lines of
      // the same product, and each must count (see decrementStockOnShip).
      const wanted = await tx.$queryRaw<{ product_id: string; ordered_qty: number }[]>`
        SELECT oi."product_id" AS product_id, SUM(oi."quantity")::int AS ordered_qty
        FROM "shp_order_items" oi
        WHERE oi."id" IN (${Prisma.join(orderItemIds)}) AND oi."product_id" IS NOT NULL
        GROUP BY oi."product_id"
      `
      if (wanted.length === 0) return []

      const products = await tx.$queryRaw<{ id: string; name: string; stock_count: number | null; out_of_stock_behaviour: string }[]>`
        SELECT "id", "name", "stock_count", "out_of_stock_behaviour"
        FROM "shp_products"
        WHERE "id" IN (${Prisma.join(wanted.map((w) => w.product_id))}) AND "track_inventory" = true
        ORDER BY "id"
        FOR UPDATE
      `

      const orderedById = new Map(wanted.map((w) => [w.product_id, Number(w.ordered_qty)]))
      const shortfalls: StockShortfall[] = []
      for (const product of products) {
        const ordered = orderedById.get(product.id) ?? 0
        if (ordered <= 0) continue
        const before = product.stock_count === null ? 0 : Number(product.stock_count)
        const after = Math.max(before - ordered, 0)
        await tx.$executeRaw`
          UPDATE "shp_products" SET "stock_count" = ${after}, "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${product.id}
        `
        moved.push(product.id)
        await recordStockMovement(tx, {
          productId: product.id,
          delta: -ordered,
          qtyBefore: before,
          qtyAfter: after,
          reason: PAID_REASON,
          reference: orderNumber,
          source: 'shop',
          userId: null,
          note: null,
        })
        // A backorder product is SUPPOSED to sell past its count - that is what
        // the setting means, and the owner already knows they owe the goods.
        if (before < ordered && product.out_of_stock_behaviour === 'BLOCK') {
          shortfalls.push({ productName: product.name, ordered, inStock: Math.max(before, 0) })
        }
      }
      return shortfalls
    },
    // The money has already moved by the time this runs, so be generous about
    // waiting for a connection, as settleRefund is.
    { maxWait: 10000, timeout: 15000 },
  )

  // After the commit, deliberately: a listener calls out to other modules and
  // must not be holding row locks on the product table while it does. It cannot
  // take the stock move down with it either - the units are off the shelf and
  // the order is paid whatever a listener makes of it (notifyProductsSaved
  // swallows its own failures).
  await notifyProductsSaved(moved, ['stockCount'])
  return shortfalls
}

type RefundLineRow = {
  order_item_id: string
  product_id: string | null
  is_pre_order: boolean
  quantity: number
  refunded_qty: number
  dispatched_qty: number
}

/**
 * Put back the stock a settled refund frees - see lib/refund-stock.ts for which
 * units that is. `items` are the lines whose refunded_qty this refund actually
 * moved, so the count read back afterwards is exactly "before + these".
 *
 * Its own transaction, after the refund has settled, and never throws: the
 * money has gone back and the refund is recorded whatever happens to the stock
 * count, and a count left short is the recoverable direction. It takes the
 * order's lock, so it cannot interleave with a dispatch (which changes what
 * counts as still in the building) or with another refund's restock.
 */
export async function restockRefundedUnits(
  orderId: string,
  items: Array<{ orderItemId: string; quantity: number }>,
): Promise<void> {
  const refunding = new Map<string, number>()
  for (const item of items) {
    if (item.quantity > 0) refunding.set(item.orderItemId, (refunding.get(item.orderItemId) ?? 0) + item.quantity)
  }
  if (refunding.size === 0) return

  // Filled inside the transaction, announced after it commits.
  const restored: string[] = []
  try {
    await prisma.$transaction(
      async (tx) => {
        // $executeRaw: pg_advisory_xact_lock returns void, which $queryRaw
        // cannot deserialise (see settleRefund in lib/db/refunds.ts).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ORDER_LOCK_NAMESPACE}::int4, hashtext(${orderId}))`

        const orderRows = await tx.$queryRaw<{ order_number: string }[]>`
          SELECT "order_number" FROM "shp_orders" WHERE "id" = ${orderId}
        `
        const orderNumber = orderRows[0]?.order_number
        if (!orderNumber) return

        const rows = await tx.$queryRaw<RefundLineRow[]>`
          SELECT oi."id" AS order_item_id,
                 oi."product_id" AS product_id,
                 oi."is_pre_order" AS is_pre_order,
                 oi."quantity" AS quantity,
                 oi."refunded_qty" AS refunded_qty,
                 COALESCE((
                   SELECT SUM(si."quantity") FROM "shp_shipment_items" si WHERE si."order_item_id" = oi."id"
                 ), 0)::int AS dispatched_qty
          FROM "shp_order_items" oi
          WHERE oi."order_id" = ${orderId} AND oi."id" IN (${Prisma.join([...refunding.keys()])})
        `

        const lines: RefundedLine[] = rows.map((r) => {
          const refundingQty = refunding.get(r.order_item_id) ?? 0
          return {
            productId: r.product_id,
            isPreOrder: r.is_pre_order,
            quantity: Number(r.quantity),
            // Read after this refund was recorded, so its own units come off to
            // give the position it found the line in.
            refundedBefore: Math.max(Number(r.refunded_qty) - refundingQty, 0),
            dispatchedQty: Number(r.dispatched_qty),
            refundingQty,
          }
        })
        const productIds = [...new Set(lines.flatMap((l) => (l.productId && !l.isPreOrder ? [l.productId] : [])))]
        if (productIds.length === 0) return

        const ledgerRows = await tx.$queryRaw<{ product_id: string; taken: number; restored: number }[]>`
          SELECT "product_id",
                 COALESCE(SUM("qty_before" - "qty_after") FILTER (WHERE "reason" = ${PAID_REASON}), 0)::int AS taken,
                 COALESCE(SUM("qty_after" - "qty_before") FILTER (WHERE "reason" = ${REFUNDED_REASON}), 0)::int AS restored
          FROM "shp_stock_movements"
          WHERE "reference" = ${orderNumber}
            AND "reason" IN (${PAID_REASON}, ${REFUNDED_REASON})
            AND "product_id" IN (${Prisma.join(productIds)})
          GROUP BY "product_id"
        `
        const ledger = new Map<string, StockLedger>(
          ledgerRows.map((r) => [r.product_id, { taken: Number(r.taken), restored: Number(r.restored) }]),
        )

        const plan = restockByProduct(lines, ledger)
        // Id order, the same as takeStockForPaidOrder, so the two never lock
        // the same pair of products in opposite orders.
        for (const productId of [...plan.keys()].sort()) {
          const units = plan.get(productId) ?? 0
          if (units <= 0) continue
          const locked = await tx.$queryRaw<{ stock_count: number | null; track_inventory: boolean }[]>`
            SELECT "stock_count", "track_inventory" FROM "shp_products" WHERE "id" = ${productId} FOR UPDATE
          `
          const product = locked[0]
          // Not keeping a count any more: nothing to put back into.
          if (!product?.track_inventory) continue
          const before = product.stock_count === null ? 0 : Number(product.stock_count)
          const after = before + units
          await tx.$executeRaw`
            UPDATE "shp_products" SET "stock_count" = ${after}, "updated_at" = CURRENT_TIMESTAMP
            WHERE "id" = ${productId}
          `
          restored.push(productId)
          await recordStockMovement(tx, {
            productId,
            delta: units,
            qtyBefore: before,
            qtyAfter: after,
            reason: REFUNDED_REASON,
            reference: orderNumber,
            source: 'shop',
            userId: null,
            note: null,
          })
        }
      },
      { maxWait: 10000, timeout: 15000 },
    )
  } catch (err) {
    console.error('[shop] a refund was recorded but its stock could not be put back', orderId, err)
    // A throw anywhere in the callback above rolls back the WHOLE transaction,
    // not just the line that failed - so `restored` may already hold product
    // ids from earlier iterations whose stock_count update was undone along
    // with everything else. None of it is really on the shelf, so there is
    // nothing here to tell a listener about. Still returns normally: this
    // function never throws to its caller, the refund is recorded whatever
    // happens to the stock count.
    return
  }

  // Reached only when the transaction genuinely committed, so every id in
  // `restored` really did go back on the shelf.
  await notifyProductsSaved(restored, ['stockCount'])
}
