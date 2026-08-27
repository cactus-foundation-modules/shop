import { prisma } from '@/lib/db/prisma'
import type {
  InventoryAdjuster,
  InventoryAdjustment,
  InventoryAdjustmentOutcome,
} from '@/lib/inventory/adjusters'
import { getProductById } from './db/products'
import { recordStockMovement } from './db/stock-movements'
import { notifyProductSaved } from './product-saved'
import { maybeTriggerBackInStock } from './back-in-stock-trigger'

// The shop's answer to core's "core.inventory-adjuster" capability: the one way
// for anything OUTSIDE the shop to change a stock count.
//
// The point of routing it through core rather than exporting a function is that
// the module doing the asking - purchasing today, a stocktake tool tomorrow -
// must never import from `@/modules/shop/...`. Those files are not in the build
// at all on an install without a shop, and a static import to them turns "this
// site has no catalogue" into "this site does not deploy".
//
// Three things happen on every move and all three used to be missed by at least
// one caller:
//
//   1. the count moves, atomically, in one statement;
//   2. the low-stock reminder is re-armed, so a restock is eligible for its own
//      alert rather than being suppressed by the one sent before it;
//   3. anybody waiting for the thing to come back is told.
//
// (3) is the existing hole this closes. `maybeTriggerBackInStock` fired from
// exactly one place - the admin product PUT route - so undoing a shipment put
// the units back on the shelf and told nobody, and a delivery booked in would
// have done the same.

type StockRow = { tracked: boolean; before: number | null; after: number | null }

/**
 * Move one product's count.
 *
 * Never throws for an ordinary refusal - an unknown product, one that is not
 * keeping count - because the caller has already filed the paperwork that
 * prompted the move and cannot unfile it.
 */
export async function adjustStock(adjustment: InventoryAdjustment): Promise<InventoryAdjustmentOutcome> {
  const [outcome] = await adjustStockBatch([adjustment])
  return outcome ?? { productId: adjustment.productId, ok: false, before: null, after: null, message: 'Nothing happened.' }
}

/**
 * Move several counts, answering for each in the order given.
 *
 * A batch rather than a loop of singles because a delivery is a dozen lines, and
 * a dozen separate round trips is a dozen chances for half of them to land.
 */
export async function adjustStockBatch(
  adjustments: InventoryAdjustment[],
): Promise<InventoryAdjustmentOutcome[]> {
  if (adjustments.length === 0) return []

  const outcomes: InventoryAdjustmentOutcome[] = []
  // Products whose count actually moved, for the notifications below. Keyed by
  // product so two lines of the same product on one delivery are one email, not
  // two - and the "before" kept is the first one, which is the count the person
  // waiting was told about.
  const moved = new Map<string, number>()

  await prisma.$transaction(async (tx) => {
    for (const adjustment of adjustments) {
      const delta = Math.trunc(adjustment.delta)
      if (!Number.isFinite(delta) || delta === 0) {
        outcomes.push({ productId: adjustment.productId, ok: true, before: null, after: null, message: 'Nothing to move.' })
        continue
      }

      // One statement, so two deliveries booked in at the same moment cannot
      // both read the same count and both write it back. The row is locked
      // first purely so the "before" written into the history is the one the
      // arithmetic actually used.
      const rows = await tx.$queryRaw<StockRow[]>`
        WITH prev AS (
          SELECT "id", "stock_count", "track_inventory"
            FROM "shp_products" WHERE "id" = ${adjustment.productId} FOR UPDATE
        ),
        upd AS (
          UPDATE "shp_products" p
             SET "stock_count" = GREATEST(COALESCE(p."stock_count", 0) + ${delta}, 0),
                 "low_stock_alerted_at" = NULL,
                 "updated_at" = CURRENT_TIMESTAMP
            FROM prev
           WHERE p."id" = prev."id" AND prev."track_inventory" = true
          RETURNING p."stock_count" AS "after"
        )
        SELECT prev."track_inventory" AS "tracked",
               prev."stock_count" AS "before",
               (SELECT "after" FROM upd) AS "after"
          FROM prev
      `
      const row = rows[0]

      if (!row) {
        outcomes.push({
          productId: adjustment.productId,
          ok: false,
          before: null,
          after: null,
          message: 'That product is not in the catalogue any more.',
        })
        continue
      }

      // Not keeping a count is not a failure. Plenty of products are made to
      // order, drop-shipped or simply never counted, and a delivery of them is
      // a perfectly ordinary delivery.
      if (!row.tracked) {
        outcomes.push({
          productId: adjustment.productId,
          ok: true,
          before: null,
          after: null,
          message: 'This one does not keep a stock count, so there was nothing to change.',
        })
        continue
      }

      const before = row.before === null ? 0 : Number(row.before)
      const after = row.after === null ? before : Number(row.after)

      await recordStockMovement(tx, {
        productId: adjustment.productId,
        delta,
        qtyBefore: before,
        qtyAfter: after,
        reason: adjustment.reason,
        reference: adjustment.ref ?? null,
        source: sourceOf(adjustment.reason),
        userId: adjustment.userId ?? null,
        note: adjustment.note ?? null,
      })

      if (!moved.has(adjustment.productId)) moved.set(adjustment.productId, before)
      outcomes.push({ productId: adjustment.productId, ok: true, before, after })
    }
  })

  // Everything below is after the commit, deliberately: it sends email and calls
  // into other modules, and neither belongs inside a transaction holding row
  // locks on the product table. None of it may take the stock move down with it
  // either - the goods are on the shelf whether or not the email went.
  for (const [productId, before] of moved) {
    try {
      await notifyProductSaved(productId, ['stockCount'])
      const product = await getProductById(productId)
      if (product) {
        await maybeTriggerBackInStock(product, {
          stockCount: before,
          outOfStockBehaviour: product.outOfStockBehaviour,
        })
      }
    } catch (error) {
      console.error('[shop] stock moved but the follow-up failed', { productId, error })
    }
  }

  return outcomes
}

/** The module a reason came from: "purchase-order.receipt" -> "purchase-order". */
function sourceOf(reason: string): string {
  const head = reason.split('.')[0]?.trim()
  return head || 'shop'
}

/** What core hands to anything asking for a stock change on this site. */
export const shopInventoryAdjuster: InventoryAdjuster = {
  label: 'Shop',
  adjust: adjustStockBatch,
}
