import { trackingEventsSchema, type TrackingEvent } from '@/modules/shop/lib/tracking/reading'
import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { outstandingUnits, unrefundedCancelledUnits } from '@/modules/shop/lib/order-requests'
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
    trackingUrl: (r.tracking_url as string | null) ?? null,
    carrier: (r.carrier as string | null) ?? null,
    courierId: (r.courier_id as string | null) ?? null,
    deliveryDate: (r.delivery_date as string | null) ?? null,
    deliverySlotStart: (r.delivery_slot_start as string | null) ?? null,
    deliverySlotEnd: (r.delivery_slot_end as string | null) ?? null,
    slotNotifiedAt: (r.slot_notified_at as Date | null) ?? null,
    trackingStage: (r.tracking_stage as string | null) ?? null,
    trackingStageAt: (r.tracking_stage_at as Date | null) ?? null,
    trackingCheckedAt: (r.tracking_checked_at as Date | null) ?? null,
    deliveredAt: (r.delivered_at as Date | null) ?? null,
    trackingShortCode: (r.tracking_short_code as string | null) ?? null,
    // jsonb comes back as a parsed value, and one written by an older build
    // could be anything at all - so it is checked rather than cast. A row that
    // does not look like a history reads as no history, which is what the page
    // renders for every parcel that has never had one.
    trackingEvents: trackingEventsSchema.safeParse(r.tracking_events).data ?? [],
    deliveryWindowFrom: (r.delivery_window_from as Date | null) ?? null,
    deliveryWindowTo: (r.delivery_window_to as Date | null) ?? null,
    stopNumber: (r.stop_number as number | null) ?? null,
    stopsCompleted: (r.stops_completed as number | null) ?? null,
    stopsTotal: (r.stops_total as number | null) ?? null,
    minutesToStop: (r.minutes_to_stop as number | null) ?? null,
    driverName: (r.driver_name as string | null) ?? null,
    carrierOutForDelivery: (r.carrier_out_for_delivery as boolean | null) ?? null,
    trackingClientId: (r.tracking_client_id as string | null) ?? null,
    trackingRouteId: (r.tracking_route_id as string | null) ?? null,
    crewLine: (r.crew_line as string | null) ?? null,
    dropsAway: (r.drops_away as number | null) ?? null,
    vehicleLat: (r.vehicle_lat as string | null) ?? null,
    vehicleLng: (r.vehicle_lng as string | null) ?? null,
    vehicleHeading: (r.vehicle_heading as number | null) ?? null,
    vehicleFixedAt: (r.vehicle_fixed_at as Date | null) ?? null,
    vehiclePolledAt: (r.vehicle_polled_at as Date | null) ?? null,
    destinationLat: (r.destination_lat as string | null) ?? null,
    destinationLng: (r.destination_lng as string | null) ?? null,
    signedBy: (r.signed_by as string | null) ?? null,
    signedAt: (r.signed_at as Date | null) ?? null,
    signatureUrl: (r.signature_url as string | null) ?? null,
    signatureKey: (r.signature_key as string | null) ?? null,
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
// Exported so lib/db/order-requests.ts can take the same lock rather than
// keeping a fourth copy of the literal: approving a return refunds units, so it
// polices exactly the same quantities as dispatch and refunds do.
export const ORDER_LOCK_NAMESPACE = 0x53485250

const ORDER_BUSY_ERROR = 'Something else is updating this order right now. Give it a moment and try again.'

export type CreateShipmentInput = {
  orderId: string
  // When the parcel actually went out. Defaults to now.
  shippedAt?: Date | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  /** The code out of a follow-my-parcel link. Stored as the code, never the
   *  whole address: the address is the courier's to restructure. */
  trackingShortCode?: string | null
  carrier?: string | null
  courierId?: string | null
  /** 'YYYY-MM-DD'. Validated by the caller, and again by the table's own CHECK. */
  deliveryDate?: string | null
  /** 'HH:MM'. Rarely known at dispatch - the courier usually confirms the
   *  window the evening before, which is what updateShipmentDelivery is for. */
  deliverySlotStart?: string | null
  deliverySlotEnd?: string | null
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
         COALESCE(agg."dispatched_qty", 0)::int AS dispatched_qty,
         COALESCE(cancelled."cancelled_qty", 0)::int AS cancelled_qty
  FROM "shp_order_items" oi
  LEFT JOIN (
    SELECT si."order_item_id" AS order_item_id, SUM(si."quantity")::int AS dispatched_qty
    FROM "shp_shipment_items" si
    JOIN "shp_shipments" s ON s."id" = si."shipment_id"
    WHERE s."order_id" = ${orderId}
    GROUP BY si."order_item_id"
  ) agg ON agg."order_item_id" = oi."id"
  -- Units an APPROVED cancellation has taken off the order. Aggregated in its
  -- own subquery before the join, exactly as the dispatch total above is and
  -- for the same reason: joining the line table straight on fans each order
  -- line out once per request and every sum afterwards counts it twice.
  --
  -- Approved only. A cancellation somebody has merely ASKED for must not stop
  -- the shop dispatching - the owner may yet say no - and a declined or
  -- withdrawn one never happened. A whole-order cancellation writes no item
  -- rows at all and contributes nothing here; it stops dispatch by putting the
  -- order into CANCELLED instead.
  LEFT JOIN (
    SELECT ri."order_item_id" AS order_item_id, SUM(ri."quantity")::int AS cancelled_qty
    FROM "shp_order_request_items" ri
    JOIN "shp_order_requests" req ON req."id" = ri."request_id"
    WHERE req."order_id" = ${orderId} AND req."type" = 'CANCEL' AND req."status" = 'APPROVED'
    GROUP BY ri."order_item_id"
  ) cancelled ON cancelled."order_item_id" = oi."id"
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
  cancelled_qty: number
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
    cancelledQty: r.cancelled_qty,
    outstandingQty: outstandingUnits({
      quantity: r.quantity,
      refundedQty: r.refunded_qty,
      dispatchedQty: r.dispatched_qty,
      cancelledQty: r.cancelled_qty,
    }),
  }
}

// Pure, so the UI can reuse it against a summary it already has rather than
// asking the database the same question twice.
//
// Fully dispatched means every unit that could go out has gone out. An order
// with nothing dispatchable (empty, refunded down to nothing, or called off) is
// NOT "fully dispatched" - there was never a parcel to send.
export function isFullyDispatched(lines: ShpOrderItemDispatch[]): boolean {
  const dispatchable = lines.reduce(
    (sum, l) => sum + Math.max(l.quantity - l.refundedQty - unrefundedCancelledUnits(l.cancelledQty, l.refundedQty), 0),
    0,
  )
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

      // Cannot dispatch units that were never bought, units that have since
      // been refunded, or units the shop has agreed to call off.
      //
      // That last one is not decoration. A customer who cancels two of five and
      // has it approved on a shop that settles refunds by hand would otherwise
      // have all five turn up: the approval moved no money, so nothing took the
      // units off the dispatch screen and the owner packed what was in front of
      // them.
      const calledOff = unrefundedCancelledUnits(row.cancelled_qty, row.refunded_qty)
      const dispatchable = Math.max(row.quantity - row.refunded_qty - calledOff, 0)
      if (row.dispatched_qty + quantity > dispatchable) {
        const remaining = Math.max(dispatchable - row.dispatched_qty, 0)
        if (remaining === 0) {
          return {
            ok: false,
            status: 400,
            error: calledOff > 0
              ? `There is nothing left to dispatch for ${row.product_name} - the rest has been cancelled.`
              : row.refunded_qty > 0
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
      INSERT INTO "shp_shipments" (
        "order_id", "shipped_at", "tracking_number", "tracking_url", "tracking_short_code",
        "carrier", "courier_id",
        "delivery_date", "delivery_slot_start", "delivery_slot_end", "notes"
      )
      VALUES (
        ${input.orderId}, ${shippedAt}, ${input.trackingNumber ?? null}, ${input.trackingUrl ?? null},
        ${input.trackingShortCode ?? null},
        ${input.carrier ?? null}, ${input.courierId ?? null},
        ${input.deliveryDate ?? null}, ${input.deliverySlotStart ?? null}, ${input.deliverySlotEnd ?? null},
        ${input.notes ?? null}
      )
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
    // $executeRaw, not $queryRaw: pg_advisory_xact_lock returns `void` and
    // Prisma cannot deserialise that type, so $queryRaw throws before the lock
    // is any use. See the longer note in lib/db/refunds.ts, where the same line
    // broke every refund the shop tried to settle.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ORDER_LOCK_NAMESPACE}::int4, hashtext(${orderId}))`

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

// The parcel details, corrected or filled in after the event.
//
// A courier books a delivery in two instalments: the DAY when the parcel is
// collected, and the four-hour WINDOW the evening before it arrives. Dispatch
// is recorded once, at the first of those, so the second has to be an edit -
// there is no second parcel to record, and recording one would tell the
// customer their order had been split.
//
// Only the details move. Which lines are in the parcel, and how many, are the
// quantities every cap in createShipment is written to police, and they stay
// where they are: to change those, delete the shipment and record it again.
// That is also why this needs no advisory lock - it cannot alter a total that a
// refund or a second dispatch is competing for.
//
// A field left out is left alone; a field set to null is cleared. Returns the
// updated parcel, or null if it does not exist or belongs to another order.
export type UpdateShipmentDetailsInput = {
  trackingNumber?: string | null
  trackingUrl?: string | null
  /** The code out of a follow-my-parcel link. Stored as the code, never the
   *  whole address: the address is the courier's to restructure. */
  trackingShortCode?: string | null
  carrier?: string | null
  courierId?: string | null
  deliveryDate?: string | null
  deliverySlotStart?: string | null
  deliverySlotEnd?: string | null
  notes?: string | null
  shippedAt?: Date | null
}

export async function updateShipmentDetails(
  shipmentId: string,
  orderId: string,
  patch: UpdateShipmentDetailsInput,
): Promise<ShpShipmentWithItems | null> {
  const assignments: Prisma.Sql[] = []
  const set = (column: string, value: unknown) => {
    assignments.push(Prisma.sql`${Prisma.raw(`"${column}"`)} = ${value}`)
  }

  if (patch.trackingNumber !== undefined) set('tracking_number', patch.trackingNumber)
  if (patch.trackingUrl !== undefined) set('tracking_url', patch.trackingUrl)
  if (patch.trackingShortCode !== undefined) set('tracking_short_code', patch.trackingShortCode)
  if (patch.carrier !== undefined) set('carrier', patch.carrier)
  if (patch.courierId !== undefined) set('courier_id', patch.courierId)
  if (patch.deliveryDate !== undefined) set('delivery_date', patch.deliveryDate)
  if (patch.deliverySlotStart !== undefined) set('delivery_slot_start', patch.deliverySlotStart)
  if (patch.deliverySlotEnd !== undefined) set('delivery_slot_end', patch.deliverySlotEnd)
  if (patch.notes !== undefined) set('notes', patch.notes)
  if (patch.shippedAt !== undefined && patch.shippedAt) set('shipped_at', patch.shippedAt)

  // Nothing to change still has to answer "does this parcel exist", because the
  // caller uses that answer to decide between a 404 and a success.
  if (assignments.length > 0) {
    assignments.push(Prisma.sql`"updated_at" = CURRENT_TIMESTAMP`)
    const changed = await prisma.$executeRaw`
      UPDATE "shp_shipments"
      SET ${Prisma.join(assignments, ', ')}
      WHERE "id" = ${shipmentId} AND "order_id" = ${orderId}
    `
    if (changed === 0) return null
  }

  const shipments = await getShipmentsForOrder(orderId)
  return shipments.find((s) => s.id === shipmentId) ?? null
}

/**
 * Claim the right to send the "your delivery window is confirmed" email.
 *
 * True exactly once per parcel. The stamp is set by the same statement that
 * reads it, so two admins saving the same window at the same moment cannot both
 * come away believing they are the one sending it - which is the shape this
 * kind of bug always takes, and the customer sees it as two identical emails.
 */
export async function claimSlotNotification(shipmentId: string, orderId: string): Promise<boolean> {
  const claimed = await prisma.$executeRaw`
    UPDATE "shp_shipments"
    SET "slot_notified_at" = CURRENT_TIMESTAMP, "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${shipmentId} AND "order_id" = ${orderId} AND "slot_notified_at" IS NULL
  `
  return claimed > 0
}

/** How long a finished order's parcel keeps being asked about while it has no
 *  proof of delivery. A fortnight covers a courier who uploads the signature
 *  the following morning, and stops a parcel that will never have one being
 *  asked about for the rest of the shop's life. */
const SIGNATURE_CATCHUP_DAYS = 14

// Parcels worth asking a courier about, in two kinds.
//
// The first is the obvious one: a tracking link, not yet delivered, on an order
// that is still live.
//
// The second exists because of what happened the first time this ran for real.
// An owner who marks an order complete HIMSELF - which is the normal thing to do
// when the van has just been - closes the order before the next hourly check,
// and the parcel then fails the "still live" test for ever. Its signature is
// never taken, and the proof of delivery is quietly lost on exactly the orders
// somebody was paying enough attention to close by hand. So a completed order's
// parcel stays in the queue while it has no signature and was sent recently
// enough to be worth asking about.
//
// It settles itself: the run that finds the signature writes it, and the row
// then fails both tests. Cancelled and refunded orders are in neither - nobody
// wants a proof of delivery for a parcel that was not delivered.
//
// Oldest check first, so a run that hits its cap works its way round rather than
// asking about the same parcel every hour.
//
// Capped by the caller. A scheduled route that fans out over an unbounded list
// is one busy Christmas away from taking longer than its own interval.
export async function listShipmentsForTrackingPoll(limit: number): Promise<ShpShipmentWithItems[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT s.* FROM "shp_shipments" s
    JOIN "shp_orders" o ON o."id" = s."order_id"
    WHERE (s."tracking_url" IS NOT NULL OR s."tracking_short_code" IS NOT NULL)
      AND (
        (
          s."delivered_at" IS NULL
          AND o."status" NOT IN ('COMPLETED', 'CANCELLED', 'REFUNDED')
        )
        OR (
          o."status" = 'COMPLETED'
          AND s."signature_url" IS NULL
          AND s."shipped_at" > CURRENT_TIMESTAMP - ${SIGNATURE_CATCHUP_DAYS}::int * INTERVAL '1 day'
        )
      )
    ORDER BY s."tracking_checked_at" ASC NULLS FIRST, s."shipped_at" ASC
    LIMIT ${limit}
  `
  // The lines are not read here: the poller does not care what is in the parcel,
  // and a second query per parcel to find out would be the expensive half of a
  // job that is meant to be cheap.
  return rows.map((row) => ({ ...mapShipment(row), items: [] }))
}

/**
 * Write back what the courier's page said.
 *
 * `checked` always moves, whether anything changed or not - that is what makes
 * "this feed has gone quiet" answerable, and what stops the poller returning to
 * the same parcel every run. `stage_at` moves only when the stage itself
 * changes, so it means "when it last moved" rather than "when we last looked".
 *
 * `delivered_at` is set once and never cleared here. A courier that
 * un-completes a parcel is either correcting itself or having a bad afternoon;
 * either way an order that has been marked finished is not something a
 * scheduled job should quietly reopen behind the owner's back.
 */
export async function recordTrackingStage(shipmentId: string, input: {
  stage: string | null
  delivered: boolean
}): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_shipments"
    SET "tracking_checked_at" = CURRENT_TIMESTAMP,
        "tracking_stage_at" = CASE
          WHEN ${input.stage}::text IS DISTINCT FROM "tracking_stage" THEN CURRENT_TIMESTAMP
          ELSE "tracking_stage_at"
        END,
        "tracking_stage" = COALESCE(${input.stage}::text, "tracking_stage"),
        "delivered_at" = CASE
          WHEN ${input.delivered} AND "delivered_at" IS NULL THEN CURRENT_TIMESTAMP
          ELSE "delivered_at"
        END,
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${shipmentId}
  `
}

/**
 * The rest of what the courier's page said: the ids their map endpoint needs,
 * their sentence about the crew, and the number read out of it.
 *
 * Overwrites rather than coalescing, and that is the point. A round that has
 * finished stops printing a crew sentence, and a parcel still showing
 * yesterday's "1 more drop to make" would have somebody waiting at a window.
 * Absent on the page means absent here.
 */
export async function recordTrackingPageDetails(shipmentId: string, input: {
  clientId: string | null
  routeId: string | null
  crewLine: string | null
  dropsAway: number | null
  destinationLat: string | null
  destinationLng: string | null
}): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_shipments"
    SET "tracking_client_id" = ${input.clientId}::text,
        "tracking_route_id" = ${input.routeId}::text,
        "crew_line" = ${input.crewLine}::text,
        "drops_away" = ${input.dropsAway}::int,
        "destination_lat" = COALESCE(${input.destinationLat}::text, "destination_lat"),
        "destination_lng" = COALESCE(${input.destinationLng}::text, "destination_lng"),
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${shipmentId}
  `
}

/**
 * What the carrier said about the parcel beyond its stage.
 *
 * Written whole, every poll, including the nulls. That is deliberate and it is
 * the opposite of how the page details are written a few lines up: those are
 * ids that persist, while these describe TODAY. A parcel that was 34th on the
 * round this morning is not 34th tomorrow, and a stop number left behind
 * because the courier stopped mentioning it would be a sentence on a customer's
 * order page that was true yesterday. The exception is the history, which only
 * ever grows: an empty read leaves the stored one alone rather than wiping a
 * timeline because a feed had a bad minute.
 */
export async function recordCarrierReading(shipmentId: string, input: {
  events: TrackingEvent[]
  windowFrom: Date | null
  windowTo: Date | null
  stopNumber: number | null
  stopsCompleted: number | null
  stopsTotal: number | null
  minutesToStop: number | null
  driverName: string | null
  outForDelivery: boolean | null
}): Promise<void> {
  const events = input.events.length > 0 ? JSON.stringify(input.events) : null
  await prisma.$executeRaw`
    UPDATE "shp_shipments"
    SET "tracking_events" = COALESCE(${events}::jsonb, "tracking_events"),
        "delivery_window_from" = ${input.windowFrom}::timestamp,
        "delivery_window_to" = ${input.windowTo}::timestamp,
        "stop_number" = ${input.stopNumber}::int,
        "stops_completed" = ${input.stopsCompleted}::int,
        "stops_total" = ${input.stopsTotal}::int,
        "minutes_to_stop" = ${input.minutesToStop}::int,
        "driver_name" = COALESCE(${input.driverName}::text, "driver_name"),
        "carrier_out_for_delivery" = ${input.outForDelivery}::boolean,
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${shipmentId}
  `
}

/**
 * Where the van was, and when it said so.
 *
 * Two timestamps because they answer different questions: `vehicle_fixed_at` is
 * the courier's own, and `vehicle_polled_at` is ours. A customer is shown the
 * first - "updated four minutes ago" is about the van, not about our diligence.
 */
export async function recordVehiclePosition(shipmentId: string, input: {
  lat: string
  lng: string
  heading: number | null
  fixedAt: Date | null
}): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_shipments"
    SET "vehicle_lat" = ${input.lat}::text,
        "vehicle_lng" = ${input.lng}::text,
        "vehicle_heading" = ${input.heading}::int,
        "vehicle_fixed_at" = ${input.fixedAt}::timestamp,
        "vehicle_polled_at" = CURRENT_TIMESTAMP,
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${shipmentId}
  `
}

/**
 * The proof of delivery, written once.
 *
 * `WHERE "signature_url" IS NULL` is the whole safety of it: this runs from a
 * scheduled job that will see the same delivered page every hour until the
 * order is closed, and without the guard every one of those runs would fetch
 * the courier's image again and leave another orphan in the bucket.
 */
export async function recordSignature(shipmentId: string, input: {
  signedBy: string | null
  signedAt: Date | null
  url: string
  key: string
}): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_shipments"
    SET "signed_by" = ${input.signedBy}::text,
        "signed_at" = ${input.signedAt}::timestamp,
        "signature_url" = ${input.url},
        "signature_key" = ${input.key},
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${shipmentId} AND "signature_url" IS NULL
  `
}

/**
 * Proof of delivery where the courier gives a name and a time but no picture.
 *
 * Separate from recordSignature because the guard has to be different. That one
 * is protected by `signature_url IS NULL` - it exists to stop an hourly job
 * fetching the same image into the bucket over and over. There is nothing to
 * fetch here and nothing to orphan, so this may run every time; what it must
 * NOT do is overwrite a real signature with a bare name, hence the guard on the
 * name rather than on the url.
 */
export async function recordReceipt(shipmentId: string, input: {
  receivedBy: string
  receivedAt: Date | null
}): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_shipments"
    SET "signed_by" = ${input.receivedBy}::text,
        "signed_at" = COALESCE(${input.receivedAt}::timestamp, "signed_at"),
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${shipmentId} AND "signed_by" IS DISTINCT FROM ${input.receivedBy}::text
  `
}

/** One parcel, for the live position route. By id and order together, so a
 *  shipment id from one order can never be read through another order's
 *  access. */
export async function getShipmentForOrder(orderId: string, shipmentId: string): Promise<ShpShipment | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_shipments" WHERE "id" = ${shipmentId} AND "order_id" = ${orderId} LIMIT 1
  `
  return rows[0] ? mapShipment(rows[0]) : null
}

/** Marks only that this parcel was looked at, for a fetch that failed. Without
 *  it a courier whose site is down would be retried first every single run,
 *  starving every other parcel behind the cap. */
export async function recordTrackingCheck(shipmentId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_shipments" SET "tracking_checked_at" = CURRENT_TIMESTAMP WHERE "id" = ${shipmentId}
  `
}

/** Every parcel on an order has been delivered, and there was at least one.
 *  The question the auto-complete hangs on. */
export async function allShipmentsDelivered(orderId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ total: bigint; delivered: bigint }[]>`
    SELECT COUNT(*)::bigint AS total,
           COUNT("delivered_at")::bigint AS delivered
    FROM "shp_shipments" WHERE "order_id" = ${orderId}
  `
  const row = rows[0]
  if (!row) return false
  return row.total > 0n && row.total === row.delivered
}
