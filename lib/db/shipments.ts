import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type {
  ShpOrderDispatchSummary,
  ShpOrderItemDispatch,
  ShpShipment,
  ShpShipmentItem,
  ShpShipmentWithItems,
} from '@/modules/shop/lib/types'

// ---------------------------------------------------------------------------
// STOCK: this layer records dispatch and NOTHING ELSE.
//
// createShipment deliberately does not touch shp_products.stock_count. Stock
// already moves in exactly two places and neither of them is here:
//   1. Normal lines decrement at PAYMENT           (lib/order-fulfillment.ts)
//   2. Pre-order lines decrement when an admin sets the order to SHIPPED
//      (app/api/admin/orders/[id]/status/route.ts -> decrementStockOnShip)
// Adding a decrement to this file would double-count against one of those and
// silently oversell - the failure only shows up as a customer buying stock that
// was never there. If dispatch is ever meant to own the pre-order decrement,
// the decrement has to MOVE off the status route in the same change, not be
// added alongside it.
// ---------------------------------------------------------------------------

function mapShipment(r: Record<string, unknown>): ShpShipment {
  return {
    id: r.id as string,
    orderId: r.order_id as string,
    shippedAt: r.shipped_at as Date,
    trackingNumber: (r.tracking_number as string | null) ?? null,
    carrier: (r.carrier as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

function mapShipmentItem(r: Record<string, unknown>): ShpShipmentItem {
  return {
    id: r.id as string,
    shipmentId: r.shipment_id as string,
    orderItemId: r.order_item_id as string,
    quantity: r.quantity as number,
  }
}

// Advisory-lock namespace. This is the SAME value lib/db/refunds.ts uses on
// purpose: refunds and dispatch both police the same units of the same order,
// so they have to be mutually exclusive on it. A refund that lands between a
// shipment's validation and its insert would otherwise refund units this code
// had just decided were still dispatchable, and the dispatched + refunded total
// would quietly exceed what the customer bought. Sharing the namespace means
// one of the two simply waits (or is turned away with a 409) instead.
const ORDER_LOCK_NAMESPACE = 0x53485250

const ORDER_BUSY_ERROR = 'Something else is updating this order right now. Give it a moment and try again.'

export type CreateShipmentInput = {
  orderId: string
  // When the parcel actually went out. Defaults to now.
  shippedAt?: Date | null
  trackingNumber?: string | null
  carrier?: string | null
  notes?: string | null
  items: Array<{ orderItemId: string; quantity: number }>
}

export type CreateShipmentResult =
  | { ok: false; status: number; error: string }
  | { ok: true; shipment: ShpShipmentWithItems }

// Per-line dispatch position, read fresh inside a transaction. The dispatched
// total is aggregated in a subquery BEFORE it is joined to the order lines:
// joining shp_shipment_items straight onto shp_order_items fans the line out
// once per shipment, and any later arithmetic then counts the same line several
// times. That exact trap already caused a real overselling bug in
// decrementStockOnShip, so it is spelled out here rather than rediscovered.
const dispatchRowsQuery = (orderId: string) => Prisma.sql`
  SELECT oi."id" AS order_item_id,
         oi."product_name" AS product_name,
         oi."quantity" AS quantity,
         oi."refunded_qty" AS refunded_qty,
         oi."is_pre_order" AS is_pre_order,
         oi."product_id" AS product_id,
         COALESCE(agg."dispatched_qty", 0)::int AS dispatched_qty
  FROM "shp_order_items" oi
  LEFT JOIN (
    SELECT si."order_item_id" AS order_item_id, SUM(si."quantity")::int AS dispatched_qty
    FROM "shp_shipment_items" si
    JOIN "shp_shipments" s ON s."id" = si."shipment_id"
    WHERE s."order_id" = ${orderId}
    GROUP BY si."order_item_id"
  ) agg ON agg."order_item_id" = oi."id"
  WHERE oi."order_id" = ${orderId}
  ORDER BY oi."product_name" ASC
`

type DispatchRow = {
  order_item_id: string
  product_name: string
  quantity: number
  refunded_qty: number
  is_pre_order: boolean
  product_id: string | null
  dispatched_qty: number
}

// Narrow enough that both the client and a transaction client satisfy it, so
// the same read serves createShipment's validation and the plain summary.
type RawClient = { $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T> }

async function readDispatchRows(client: RawClient, orderId: string): Promise<DispatchRow[]> {
  return client.$queryRaw<DispatchRow[]>(dispatchRowsQuery(orderId))
}

function toDispatchLine(r: DispatchRow): ShpOrderItemDispatch {
  return {
    orderItemId: r.order_item_id,
    productName: r.product_name,
    quantity: r.quantity,
    refundedQty: r.refunded_qty,
    dispatchedQty: r.dispatched_qty,
    outstandingQty: Math.max(r.quantity - r.refunded_qty - r.dispatched_qty, 0),
  }
}

// Pure, so the UI can reuse it against a summary it already has rather than
// asking the database the same question twice.
//
// Fully dispatched means every unit that could go out has gone out. An order
// with nothing dispatchable (empty, or refunded down to nothing) is NOT
// "fully dispatched" - there was never a parcel to send.
export function isFullyDispatched(lines: ShpOrderItemDispatch[]): boolean {
  const dispatchable = lines.reduce((sum, l) => sum + Math.max(l.quantity - l.refundedQty, 0), 0)
  if (dispatchable === 0) return false
  return lines.every((l) => l.outstandingQty === 0)
}

export function isPartiallyDispatched(lines: ShpOrderItemDispatch[]): boolean {
  const dispatched = lines.reduce((sum, l) => sum + l.dispatchedQty, 0)
  return dispatched > 0 && !isFullyDispatched(lines)
}

function toSummary(orderId: string, rows: DispatchRow[]): ShpOrderDispatchSummary {
  const lines = rows.map(toDispatchLine)
  return {
    orderId,
    lines,
    fullyDispatched: isFullyDispatched(lines),
    partiallyDispatched: isPartiallyDispatched(lines),
  }
}

// Records one dispatch of a subset of an order's lines, in a single
// transaction, under the order's advisory lock.
//
// Rejections come back as { ok: false, status, error } with a message fit to
// show a shop owner, matching how processRefund reports its failures - callers
// can hand `error` straight to the response body.
export async function createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
  const items = input.items.filter((i) => i.quantity > 0)
  if (items.length === 0) {
    return { ok: false, status: 400, error: 'Choose at least one item to mark as dispatched.' }
  }
  if (items.some((i) => !Number.isInteger(i.quantity))) {
    return { ok: false, status: 400, error: 'Dispatch quantities have to be whole numbers.' }
  }

  // Two lines for the same order item in one request would each validate
  // against the same starting figure and together sail past the cap, so fold
  // them together before anything is checked.
  const merged = new Map<string, number>()
  for (const item of items) merged.set(item.orderItemId, (merged.get(item.orderItemId) ?? 0) + item.quantity)

  return prisma.$transaction(async (tx): Promise<CreateShipmentResult> => {
    // Transaction-scoped, so Postgres releases it on commit or rollback and a
    // request that dies mid-flight cannot strand it.
    const locked = await tx.$queryRaw<[{ locked: boolean }]>`
      SELECT pg_try_advisory_xact_lock(${ORDER_LOCK_NAMESPACE}::int4, hashtext(${input.orderId})) AS locked
    `
    if (!locked[0]?.locked) return { ok: false, status: 409, error: ORDER_BUSY_ERROR }

    const orderRows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "shp_orders" WHERE "id" = ${input.orderId}
    `
    if (!orderRows[0]) return { ok: false, status: 404, error: 'Order not found' }

    // Read every line's position under the lock - not just the ones being
    // dispatched - so the same figures decide both the caps and the summary.
    const rows = await readDispatchRows(tx, input.orderId)
    const byId = new Map(rows.map((r) => [r.order_item_id, r]))

    for (const [orderItemId, quantity] of merged) {
      const row = byId.get(orderItemId)
      if (!row) return { ok: false, status: 404, error: 'Order item not found' }

      // Cannot dispatch units that were never bought, and cannot dispatch units
      // that have since been refunded.
      const dispatchable = Math.max(row.quantity - row.refunded_qty, 0)
      if (row.dispatched_qty + quantity > dispatchable) {
        const remaining = Math.max(dispatchable - row.dispatched_qty, 0)
        if (remaining === 0) {
          return {
            ok: false,
            status: 400,
            error: row.refunded_qty > 0
              ? `There is nothing left to dispatch for ${row.product_name} - the rest has been refunded.`
              : `${row.product_name} has already been dispatched in full.`,
          }
        }
        return {
          ok: false,
          status: 400,
          error: `Cannot dispatch ${quantity} of ${row.product_name}: only ${remaining} of the ${row.quantity} bought are still to go out.`,
        }
      }
    }

    const shippedAt = input.shippedAt ?? new Date()
    const created = await tx.$queryRaw<[Record<string, unknown>]>`
      INSERT INTO "shp_shipments" ("order_id", "shipped_at", "tracking_number", "carrier", "notes")
      VALUES (${input.orderId}, ${shippedAt}, ${input.trackingNumber ?? null}, ${input.carrier ?? null}, ${input.notes ?? null})
      RETURNING *
    `
    const shipment = mapShipment(created[0])

    const shipmentItems: ShpShipmentItem[] = []
    for (const [orderItemId, quantity] of merged) {
      const itemRows = await tx.$queryRaw<[Record<string, unknown>]>`
        INSERT INTO "shp_shipment_items" ("shipment_id", "order_item_id", "quantity")
        VALUES (${shipment.id}, ${orderItemId}, ${quantity})
        RETURNING *
      `
      shipmentItems.push(mapShipmentItem(itemRows[0]))
    }

    // THE SINGLE-DECREMENT INVARIANT. Every unit sold reduces stock exactly once,
    // ever. Where that happens depends on the kind of line:
    //
    //   normal line    -> at payment, in lib/order-fulfillment.ts
    //   pre-order line -> here, when the units actually go out
    //
    // Pre-order stock used to come off when the whole order was flipped to
    // SHIPPED, which part-dispatch broke in both directions: dispatch 1 of 3 and
    // stock fell by 3, or never flip the order and stock never fell at all. It
    // now comes off per shipment, for the units in THAT shipment.
    //
    // So: do NOT add a decrement for normal lines here (they have already been
    // counted at payment - doing it again quietly loses stock), and do NOT
    // reinstate one on the SHIPPED transition (the status route now records an
    // implicit shipment for whatever is left, which lands back here).
    //
    // Inside the same transaction and the same advisory lock as the validation
    // above, so it cannot interleave with a concurrent refund or dispatch.
    for (const [orderItemId, quantity] of merged) {
      const row = byId.get(orderItemId)
      if (!row?.is_pre_order || !row.product_id) continue
      await tx.$executeRaw`
        UPDATE "shp_products"
        SET "stock_count" = GREATEST(COALESCE("stock_count", 0) - ${quantity}, 0),
            "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${row.product_id} AND "track_inventory" = true
      `
    }

    return { ok: true, shipment: { ...shipment, items: shipmentItems } }
  })
}

// Every shipment on an order, oldest first, each with its lines. Two queries
// rather than a join, so nothing has to be de-duplicated on the way out.
export async function getShipmentsForOrder(orderId: string): Promise<ShpShipmentWithItems[]> {
  const shipmentRows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_shipments" WHERE "order_id" = ${orderId} ORDER BY "shipped_at" ASC, "created_at" ASC
  `
  const shipments = shipmentRows.map(mapShipment)
  if (shipments.length === 0) return []

  const itemRows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT si.* FROM "shp_shipment_items" si
    JOIN "shp_shipments" s ON s."id" = si."shipment_id"
    WHERE s."order_id" = ${orderId}
  `
  const itemsByShipment = new Map<string, ShpShipmentItem[]>()
  for (const raw of itemRows) {
    const item = mapShipmentItem(raw)
    const list = itemsByShipment.get(item.shipmentId)
    if (list) list.push(item)
    else itemsByShipment.set(item.shipmentId, [item])
  }

  return shipments.map((s) => ({ ...s, items: itemsByShipment.get(s.id) ?? [] }))
}

// orderItemId -> units already dispatched. Only lines with a dispatch appear,
// so read it with `?? 0`. Handy when a caller has the order lines already and
// just wants the extra column.
export async function getDispatchedQtyByOrderItem(orderId: string): Promise<Record<string, number>> {
  const rows = await prisma.$queryRaw<{ order_item_id: string; dispatched_qty: number }[]>`
    SELECT si."order_item_id" AS order_item_id, SUM(si."quantity")::int AS dispatched_qty
    FROM "shp_shipment_items" si
    JOIN "shp_shipments" s ON s."id" = si."shipment_id"
    WHERE s."order_id" = ${orderId}
    GROUP BY si."order_item_id"
  `
  const out: Record<string, number> = {}
  for (const row of rows) out[row.order_item_id] = row.dispatched_qty
  return out
}

// The whole picture for an order: a row per line with bought / refunded /
// dispatched / outstanding, plus the derived fully- and partially-dispatched
// flags. This is what the order screen wants.
export async function getOrderDispatchSummary(orderId: string): Promise<ShpOrderDispatchSummary> {
  const rows = await readDispatchRows(prisma, orderId)
  return toSummary(orderId, rows)
}

// Derived, never stored: no ShpOrderStatus value is added for this.
export async function isOrderFullyDispatched(orderId: string): Promise<boolean> {
  const summary = await getOrderDispatchSummary(orderId)
  return summary.fullyDispatched
}

// Undo a dispatch recorded by mistake. The lines go with it (ON DELETE CASCADE)
// and the dispatched totals fall back out on their own, because they are summed
// from those lines rather than held in a counter. Returns false if the shipment
// does not exist or belongs to another order.
// Undoing a dispatch has to put the stock back, or "recorded it on the wrong
// order" becomes a way to quietly lose stock with no trace. Same rule as
// createShipment: only pre-order lines moved stock here, so only they get it
// back - handing stock back for a normal line would invent inventory that was
// counted at payment and never taken off here.
//
// Wrapped in a transaction taking the order's advisory lock so the read of what
// the shipment covered and the delete cannot race a concurrent dispatch.
export async function deleteShipment(shipmentId: string, orderId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${ORDER_LOCK_NAMESPACE}::int4, hashtext(${orderId}))`

    const covered = await tx.$queryRaw<{ product_id: string | null; quantity: number; is_pre_order: boolean }[]>`
      SELECT oi."product_id" AS product_id, si."quantity" AS quantity, oi."is_pre_order" AS is_pre_order
      FROM "shp_shipment_items" si
      JOIN "shp_shipments" s ON s."id" = si."shipment_id"
      JOIN "shp_order_items" oi ON oi."id" = si."order_item_id"
      WHERE si."shipment_id" = ${shipmentId} AND s."order_id" = ${orderId}
    `

    const deleted = await tx.$executeRaw`
      DELETE FROM "shp_shipments" WHERE "id" = ${shipmentId} AND "order_id" = ${orderId}
    `
    if (deleted === 0) return false

    for (const line of covered) {
      if (!line.is_pre_order || !line.product_id) continue
      await tx.$executeRaw`
        UPDATE "shp_products"
        SET "stock_count" = COALESCE("stock_count", 0) + ${line.quantity},
            "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${line.product_id} AND "track_inventory" = true
      `
    }
    return true
  })
}
