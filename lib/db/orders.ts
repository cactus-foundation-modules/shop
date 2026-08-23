import { prisma, type PrismaTransactionClient } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { decrementPreOrderCount, getProductById } from '@/modules/shop/lib/db/products'
import { normaliseStoredPhone } from '@/modules/shop/lib/phone'
import type { LineMeta, ShpAddress, ShpOrder, ShpOrderAgreement, ShpOrderItem, ShpOrderStatus, ShpPaymentMethod, ShpPaymentStatus } from '@/modules/shop/lib/types'

function mapOrder(r: Record<string, unknown>): ShpOrder {
  return {
    id: r.id as string,
    orderNumber: r.order_number as string,
    status: r.status as ShpOrderStatus,
    memberId: (r.member_id as string | null) ?? null,
    customerEmail: r.customer_email as string,
    customerName: r.customer_name as string,
    customerPhone: (r.customer_phone as string | null) ?? null,
    shippingAddress: r.shipping_address as ShpAddress,
    billingAddress: (r.billing_address as ShpAddress | null) ?? null,
    subtotal: (r.subtotal as { toString(): string }).toString(),
    discountAmount: (r.discount_amount as { toString(): string }).toString(),
    shippingAmount: (r.shipping_amount as { toString(): string }).toString(),
    taxAmount: (r.tax_amount as { toString(): string }).toString(),
    total: (r.total as { toString(): string }).toString(),
    taxMode: r.tax_mode as ShpOrder['taxMode'],
    currency: r.currency as string,
    couponId: (r.coupon_id as string | null) ?? null,
    couponCode: (r.coupon_code as string | null) ?? null,
    paymentMethod: r.payment_method as ShpPaymentMethod,
    paymentStatus: r.payment_status as ShpPaymentStatus,
    paymentReference: (r.payment_reference as string | null) ?? null,
    paidAt: (r.paid_at as Date | null) ?? null,
    shippingRateId: (r.shipping_rate_id as string | null) ?? null,
    shippingRateName: (r.shipping_rate_name as string | null) ?? null,
    // jsonb comes back already parsed; NULL on an order placed before the shop
    // asked anything.
    agreements: (r.agreements as ShpOrderAgreement[] | null) ?? null,
    // Columns added by migration 020. Defaulted here as well as in the DDL so a
    // row read through an older cached query shape still answers "email only"
    // rather than undefined.
    notifyEmail: (r.notify_email as boolean | null) ?? true,
    notifySms: (r.notify_sms as boolean | null) ?? false,
    notifyPhone: (r.notify_phone as string | null) ?? null,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

function mapOrderItem(r: Record<string, unknown>): ShpOrderItem {
  return {
    id: r.id as string,
    orderId: r.order_id as string,
    productId: (r.product_id as string | null) ?? null,
    productName: r.product_name as string,
    productSku: (r.product_sku as string | null) ?? null,
    productType: r.product_type as ShpOrderItem['productType'],
    quantity: r.quantity as number,
    unitPrice: (r.unit_price as { toString(): string }).toString(),
    taxRate: (r.tax_rate as { toString(): string }).toString(),
    taxAmount: (r.tax_amount as { toString(): string }).toString(),
    total: (r.total as { toString(): string }).toString(),
    refundedQty: r.refunded_qty as number,
    isPreOrder: r.is_pre_order as boolean,
    preOrderDispatchDate: (r.pre_order_dispatch_date as Date | null) ?? null,
    // jsonb comes back already parsed (or null for an unpersonalised line).
    lineMeta: (r.line_meta as LineMeta | null) ?? null,
  }
}

export async function getOrderById(id: string): Promise<ShpOrder | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_orders" WHERE "id" = ${id} LIMIT 1`
  return rows[0] ? mapOrder(rows[0]) : null
}

export async function getOrderByNumber(orderNumber: string): Promise<ShpOrder | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_orders" WHERE "order_number" = ${orderNumber} LIMIT 1`
  return rows[0] ? mapOrder(rows[0]) : null
}

// Guest lookup: order number + email must both match (no enumeration - spec 8.1).
export async function getOrderByNumberAndEmail(orderNumber: string, email: string): Promise<ShpOrder | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_orders" WHERE "order_number" = ${orderNumber} AND lower("customer_email") = lower(${email}) LIMIT 1
  `
  return rows[0] ? mapOrder(rows[0]) : null
}

// Resolve an order from the provider reference stored by markOrderPaid (for
// Stripe that reference is the PaymentIntent id). Stripe's charge.refunded
// event only carries the intent id on the charge, not the shpOrderId metadata
// (that lives on the PaymentIntent and Stripe never copies it to the charge),
// so a dashboard refund has to be matched back to the order this way.
export async function getOrderByPaymentReference(reference: string): Promise<ShpOrder | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_orders" WHERE "payment_reference" = ${reference} LIMIT 1`
  return rows[0] ? mapOrder(rows[0]) : null
}

export async function getOrderItems(orderId: string): Promise<ShpOrderItem[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_order_items" WHERE "order_id" = ${orderId} ORDER BY "id" ASC`
  return rows.map(mapOrderItem)
}

export async function getOrderItemById(id: string): Promise<ShpOrderItem | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_order_items" WHERE "id" = ${id} LIMIT 1`
  return rows[0] ? mapOrderItem(rows[0]) : null
}

export type CreateOrderInput = {
  // Normally left off and minted by the column default. It is supplied when the
  // id was decided BEFORE the order existed - a checkout draft mints it so the
  // payment provider can be handed a reference that survives into the order it
  // eventually becomes. See lib/checkout-draft.ts.
  id?: string | null
  orderNumber: string
  memberId?: string | null
  customerEmail: string
  customerName: string
  customerPhone?: string | null
  shippingAddress: ShpAddress
  billingAddress?: ShpAddress | null
  subtotal: number
  discountAmount: number
  shippingAmount: number
  taxAmount: number
  total: number
  taxMode: 'INCLUSIVE' | 'EXCLUSIVE'
  currency: string
  couponId?: string | null
  couponCode?: string | null
  paymentMethod: ShpPaymentMethod
  shippingRateId?: string | null
  shippingRateName?: string | null
  agreements?: ShpOrderAgreement[] | null
  items: Array<{
    productId: string | null
    productName: string
    productSku: string | null
    productType: ShpOrderItem['productType']
    quantity: number
    unitPrice: number
    taxRate: number
    taxAmount: number
    total: number
    isPreOrder: boolean
    preOrderDispatchDate: Date | null
    lineMeta?: LineMeta | null
  }>
}

// The order row + item snapshot, written inside a transaction the CALLER owns.
//
// Split out from createPendingOrder because a draft-backed checkout has to do
// more in the same transaction than create the order: it deletes the draft the
// order was made from, and the two must stand or fall together (see
// lib/checkout-draft.ts). Everything about how an order row is born lives here,
// so there is still exactly one place it happens.
//
// The phone number is put into canonical form here rather than at each caller:
// this is the one place an order row is ever born, so a number typed on the
// checkout, on the admin's manual order screen or by a module calling in is
// stored the same way and can be searched for as one thing. See lib/phone.ts.
export async function insertOrderRows(tx: PrismaTransactionClient, data: CreateOrderInput): Promise<{ id: string; orderNumber: string }> {
  const rows = await tx.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_orders" (
      "id",
      "order_number", "member_id", "customer_email", "customer_name", "customer_phone",
      "shipping_address", "billing_address", "subtotal", "discount_amount", "shipping_amount",
      "tax_amount", "total", "tax_mode", "currency", "coupon_id", "coupon_code",
      "payment_method", "shipping_rate_id", "shipping_rate_name", "agreements"
    ) VALUES (
      -- An id the caller decided earlier, or the one the column would have
      -- given it anyway. Written as a value rather than left to the default
      -- so both cases go through one statement.
      COALESCE(${data.id ?? null}::text, gen_random_uuid()::text),
      ${data.orderNumber}, ${data.memberId ?? null}, ${data.customerEmail}, ${data.customerName}, ${normaliseStoredPhone(data.customerPhone)},
      ${JSON.stringify(data.shippingAddress)}::jsonb, ${data.billingAddress ? JSON.stringify(data.billingAddress) : null}::jsonb,
      ${data.subtotal}, ${data.discountAmount}, ${data.shippingAmount}, ${data.taxAmount}, ${data.total},
      ${data.taxMode}, ${data.currency}, ${data.couponId ?? null}, ${data.couponCode ?? null},
      ${data.paymentMethod}, ${data.shippingRateId ?? null}, ${data.shippingRateName ?? null},
      ${data.agreements ? JSON.stringify(data.agreements) : null}::jsonb
    )
    RETURNING "id"
  `
  const orderId = rows[0].id
  for (const item of data.items) {
    await tx.$executeRaw`
      INSERT INTO "shp_order_items" (
        "order_id", "product_id", "product_name", "product_sku", "product_type",
        "quantity", "unit_price", "tax_rate", "tax_amount", "total", "is_pre_order", "pre_order_dispatch_date",
        "line_meta"
      ) VALUES (
        ${orderId}, ${item.productId}, ${item.productName}, ${item.productSku}, ${item.productType},
        ${item.quantity}, ${item.unitPrice}, ${item.taxRate}, ${item.taxAmount}, ${item.total},
        ${item.isPreOrder}, ${item.preOrderDispatchDate},
        ${item.lineMeta ? JSON.stringify(item.lineMeta) : null}::jsonb
      )
    `
  }
  return { id: orderId, orderNumber: data.orderNumber }
}

// Creates the PENDING order row + item snapshot in one transaction.
//
// Used by the methods that take payment with the shopper still on this site
// (a card form, or a method somebody settles by hand later): the order exists
// before the payment intent, so a webhook or a confirm call always has
// something to update. Methods that hand the shopper over to a bank or a hosted
// payment page do NOT come through here until the money is real - they draft
// the order instead, and create it on settlement. See lib/checkout-draft.ts.
export async function createPendingOrder(data: CreateOrderInput): Promise<{ id: string; orderNumber: string }> {
  return prisma.$transaction((tx) => insertOrderRows(tx, data))
}

// Idempotent, in the same spirit as markOrderPaid below: the `status != status`
// guard means re-sending a status the order already has changes nothing and
// returns false. That boolean is not decoration - anything a caller runs once
// per transition has to be gated on it.
//
// This used to be a bare UPDATE returning nothing, and the admin status route
// decremented pre-order stock whenever the new status was SHIPPED. Walking an
// order SHIPPED -> COMPLETED -> SHIPPED therefore decremented the same
// pre-order units twice, and decrementStockOnShip clamps with GREATEST(...,0),
// so the shop quietly undercounted its own stock rather than erroring.
export async function updateOrderStatus(id: string, status: ShpOrderStatus): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE "shp_orders" SET "status" = ${status}, "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id} AND "status" != ${status}
  `
  return result > 0
}

// Which pre-order lines on this order are still waiting on stock.
//
// The dispatch date snapshotted on the line is the primary signal: a date still
// in the future means the stock is not due yet. A date that has passed means it
// has landed, so the line is ready.
//
// A line with no date is the awkward one - a "coming soon, date to be confirmed"
// pre-order. There the product's own is_pre_order flag stands in for the date:
// while the owner still has the product marked as a pre-order, nothing has
// arrived. Unticking it once stock lands is what clears the line, and it is the
// owner's escape hatch out of an otherwise permanent hold. If the product row
// has gone altogether the owner has no lever left to pull, so the line is
// treated as ready rather than jamming the order shut for good.
//
// This lives here rather than in a route because two callers need the SAME
// answer: the status route ENFORCES the HOLD_ALL policy with it, and the
// dispatch route EXPLAINS the hold to the owner with it. Two copies of a rule
// that decides whether an order may go out would drift, and the two would then
// disagree about whether the shop is holding the order.
export async function outstandingPreOrderItems(items: ShpOrderItem[]): Promise<ShpOrderItem[]> {
  const now = Date.now()
  const outstanding: ShpOrderItem[] = []
  for (const item of items) {
    if (!item.isPreOrder) continue
    if (item.preOrderDispatchDate) {
      if (item.preOrderDispatchDate.getTime() > now) outstanding.push(item)
      continue
    }
    if (!item.productId) continue
    const product = await getProductById(item.productId)
    if (product?.isPreOrder) outstanding.push(item)
  }
  return outstanding
}

// Hands back the pre-order allocation an order is holding, for a cancellation.
// Two guards keep it honest:
//  - `paid_at IS NOT NULL`, because the allocation is only ever consumed by
//    fulfillPaidOrder, which runs off markOrderPaid. An order cancelled before
//    it paid never took a slot, so releasing one would invent allocation.
//  - `quantity - refunded_qty`, so only the units still held are released. If a
//    refund already gave some units back, cancelling the remainder cannot
//    double-release them.
// Call it only on a genuine transition into CANCELLED (see updateOrderStatus).
export async function releasePreOrderAllocationForOrder(orderId: string): Promise<void> {
  const rows = await prisma.$queryRaw<{ product_id: string; qty: number }[]>`
    SELECT oi."product_id" AS product_id, SUM(oi."quantity" - oi."refunded_qty")::int AS qty
    FROM "shp_order_items" oi
    JOIN "shp_orders" o ON o."id" = oi."order_id"
    WHERE oi."order_id" = ${orderId}
      AND oi."is_pre_order" = true
      AND oi."product_id" IS NOT NULL
      AND o."paid_at" IS NOT NULL
    GROUP BY oi."product_id"
    HAVING SUM(oi."quantity" - oi."refunded_qty") > 0
  `
  for (const row of rows) {
    await decrementPreOrderCount(row.product_id, row.qty)
  }
}

// Idempotent - replayed webhook events must be no-ops (spec 7.1/7.2). Only
// transitions PENDING → PAID; a second call with the same event is a no-op
// because the WHERE clause no longer matches.
export async function markOrderPaid(id: string, paymentReference: string): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE "shp_orders" SET "payment_status" = 'PAID', "paid_at" = CURRENT_TIMESTAMP,
      "payment_reference" = ${paymentReference}, "status" = 'PROCESSING', "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id} AND "payment_status" != 'PAID'
  `
  return result > 0
}

// Two distinct events land here:
//  - reason 'FAILED' (the default, and what the Stripe/PayPal failure webhooks
//    and the confirm route pass): a payment attempt that never cleared. PAID is
//    excluded, so a stray late failure can never quietly undo an order that has
//    already been paid. AWAITING_CONFIRMATION has to be included alongside
//    PENDING, and used not to be: an authorised-but-unsettled payment (open
//    banking) is parked there by the return route, so guarding on PENDING alone
//    meant the failure webhook that followed matched no rows at all and the
//    order sat in the owner's awaiting-confirmation queue for good, reading as
//    money still on its way.
//  - reason 'CHARGEBACK' (the GoCardless settle handler passes this when a
//    settled payment is later charged back or fails at the bank): the money has
//    been clawed back AFTER the order was marked PAID, and the goods may already
//    have shipped. That must be loud, not a silent no-op - flip the order to a
//    visible reversed state and leave the owner a note.
export async function markOrderPaymentFailed(id: string, reason: 'FAILED' | 'CHARGEBACK' = 'FAILED'): Promise<void> {
  if (reason === 'CHARGEBACK') {
    const reversed = await prisma.$executeRaw`
      UPDATE "shp_orders" SET "payment_status" = 'FAILED', "status" = 'ON_HOLD', "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${id} AND "payment_status" = 'PAID'
    `
    // Only when a PAID order actually flipped (guards against a replayed webhook
    // re-noting an order that has already been reversed).
    if (reversed > 0) {
      await prisma.$executeRaw`
        INSERT INTO "shp_order_notes" ("order_id", "content", "is_internal", "created_by")
        VALUES (
          ${id},
          ${'Payment was reversed after this order was marked paid (chargeback or a late bank failure). The order has been placed on hold - check whether anything shipped against funds that have now been clawed back.'},
          true,
          ${null}
        )
      `
    }
    return
  }

  await prisma.$executeRaw`
    UPDATE "shp_orders" SET "payment_status" = 'FAILED', "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id} AND "payment_status" IN ('PENDING', 'AWAITING_CONFIRMATION')
  `
}

export async function markOrderAwaitingConfirmation(id: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_orders" SET "payment_status" = 'AWAITING_CONFIRMATION', "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${id}
  `
}

// Idempotent like markOrderPaid: the `payment_status != 'PAID'` guard makes a
// second confirm a no-op and returns false, so callers only run the exactly-once
// fulfilment side-effects when this returns true.
export async function confirmManualPayment(id: string): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE "shp_orders" SET "payment_status" = 'PAID', "paid_at" = CURRENT_TIMESTAMP, "status" = 'PROCESSING', "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id} AND "payment_status" != 'PAID'
  `
  return result > 0
}

export async function setOrderPaymentReference(id: string, reference: string): Promise<void> {
  await prisma.$executeRaw`UPDATE "shp_orders" SET "payment_reference" = ${reference}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${id}`
}

// Prunes stale PENDING orders that never paid (Q8 cron scope).
export async function pruneAbandonedPendingOrders(olderThanHours: number): Promise<number> {
  return prisma.$executeRaw`
    DELETE FROM "shp_orders" WHERE "status" = 'PENDING' AND "payment_status" = 'PENDING'
      AND "created_at" < NOW() - (${olderThanHours} || ' hours')::interval
  `
}

// How much of an order has left the building, and how much is still owed, said
// in SQL so a list of orders can be filtered and counted on it without loading
// every line into JavaScript first.
//
// Both correlate on o."id", so they only ever appear inside a query that has
// "shp_orders" aliased as `o`. Units already dispatched are summed from
// shp_shipment_items through a subquery keyed by order item BEFORE anything is
// joined to the order lines - joining the parcel lines straight onto the order
// lines fans a line out once per parcel and counts it twice, which is the exact
// trap that once caused real overselling (see lib/db/shipments.ts).
const DISPATCHED_UNITS_SQL = Prisma.sql`
  COALESCE((
    SELECT SUM(si."quantity")::int
    FROM "shp_shipment_items" si
    JOIN "shp_order_items" oi_d ON oi_d."id" = si."order_item_id"
    WHERE oi_d."order_id" = o."id"
  ), 0)
`
const OUTSTANDING_UNITS_SQL = Prisma.sql`
  COALESCE((
    SELECT SUM(GREATEST(oi_o."quantity" - oi_o."refunded_qty" - COALESCE(sent."qty", 0), 0))::int
    FROM "shp_order_items" oi_o
    LEFT JOIN (
      SELECT si2."order_item_id" AS order_item_id, SUM(si2."quantity")::int AS qty
      FROM "shp_shipment_items" si2 GROUP BY si2."order_item_id"
    ) sent ON sent."order_item_id" = oi_o."id"
    WHERE oi_o."order_id" = o."id"
  ), 0)
`

// Dispatch progress as something an owner can filter a list by. Deliberately
// the same three readings the order screen shows as a badge, so "Partly
// dispatched" in the list and "Partly dispatched" on the order can never mean
// two different things. Not a stored status - see ShpOrderDispatchSummary.
export type OrderFulfilment = 'UNDISPATCHED' | 'PARTIAL' | 'DISPATCHED'

const FULFILMENT_CONDITION: Record<OrderFulfilment, Prisma.Sql> = {
  UNDISPATCHED: Prisma.sql`${DISPATCHED_UNITS_SQL} = 0 AND ${OUTSTANDING_UNITS_SQL} > 0`,
  PARTIAL: Prisma.sql`${DISPATCHED_UNITS_SQL} > 0 AND ${OUTSTANDING_UNITS_SQL} > 0`,
  DISPATCHED: Prisma.sql`${DISPATCHED_UNITS_SQL} > 0 AND ${OUTSTANDING_UNITS_SQL} = 0`,
}

export type OrderSort = 'newest' | 'oldest' | 'total-desc' | 'total-asc' | 'customer-asc' | 'status'

// The company an order was placed on behalf of, read exactly the way the screen
// reads it (orderCompanyName in lib/order-display.ts): billing first because
// that is the party being invoiced, then delivery, and a blank field counts as
// not given rather than as a company called "". Kept as one fragment so the
// search, the sort and the list can never disagree about who the customer is.
const ORDER_COMPANY_SQL = Prisma.sql`COALESCE(NULLIF(btrim(o."billing_address"->>'company'), ''), NULLIF(btrim(o."shipping_address"->>'company'), ''))`

const SORT_CLAUSE: Record<OrderSort, Prisma.Sql> = {
  newest: Prisma.sql`ORDER BY o."created_at" DESC`,
  oldest: Prisma.sql`ORDER BY o."created_at" ASC`,
  'total-desc': Prisma.sql`ORDER BY o."total" DESC, o."created_at" DESC`,
  'total-asc': Prisma.sql`ORDER BY o."total" ASC, o."created_at" DESC`,
  'customer-asc': Prisma.sql`ORDER BY lower(COALESCE(${ORDER_COMPANY_SQL}, o."customer_name")) ASC, o."created_at" DESC`,
  status: Prisma.sql`ORDER BY o."status" ASC, o."created_at" DESC`,
}

export type ListOrdersFilter = {
  page?: number
  perPage?: number
  status?: ShpOrderStatus
  // 'UNPAID' is the useful reading of "money still owed" - an order sitting on
  // PENDING and one parked on AWAITING_CONFIRMATION are the same job from the
  // owner's side, and having to check both separately is how one gets forgotten.
  paymentStatus?: ShpPaymentStatus | 'UNPAID'
  search?: string
  preOrder?: boolean
  fulfilment?: OrderFulfilment
  // Hides cancelled orders. The counters on the orders screen are all "what is
  // still to do", so every one of them is counted this way; the tiles link
  // through with it set, which is what keeps a tile's number and its list the
  // same length.
  openOnly?: boolean
  dateFrom?: Date
  dateTo?: Date
  sort?: OrderSort
}

const OPEN_ONLY_SQL = Prisma.sql`o."status" <> 'CANCELLED'`
const UNPAID_SQL = Prisma.sql`o."payment_status" IN ('PENDING', 'AWAITING_CONFIRMATION')`

export async function listOrders(filter: ListOrdersFilter): Promise<{ orders: ShpOrder[]; total: number }> {
  const page = Math.max(1, Math.floor(Number(filter.page)) || 1)
  const perPage = Math.min(200, Math.max(1, Math.floor(Number(filter.perPage)) || 25))
  const offset = (page - 1) * perPage

  const conditions: Prisma.Sql[] = []
  if (filter.status) conditions.push(Prisma.sql`o."status" = ${filter.status}`)
  if (filter.paymentStatus === 'UNPAID') conditions.push(UNPAID_SQL)
  else if (filter.paymentStatus) conditions.push(Prisma.sql`o."payment_status" = ${filter.paymentStatus}`)
  if (filter.openOnly) conditions.push(OPEN_ONLY_SQL)
  // Company is searched as well as the person's name: on a trade shop the name
  // on the order is whoever in the office typed it, and "Acme" is what the
  // owner actually remembers the order by.
  if (filter.search) conditions.push(Prisma.sql`(o."order_number" ILIKE ${`%${filter.search}%`} OR o."customer_email" ILIKE ${`%${filter.search}%`} OR o."customer_name" ILIKE ${`%${filter.search}%`} OR ${ORDER_COMPANY_SQL} ILIKE ${`%${filter.search}%`})`)
  if (filter.dateFrom) conditions.push(Prisma.sql`o."created_at" >= ${filter.dateFrom}`)
  if (filter.dateTo) conditions.push(Prisma.sql`o."created_at" <= ${filter.dateTo}`)
  if (filter.preOrder) {
    conditions.push(Prisma.sql`o."id" IN (SELECT "order_id" FROM "shp_order_items" WHERE "is_pre_order" = true)`)
  }
  if (filter.fulfilment) conditions.push(Prisma.sql`(${FULFILMENT_CONDITION[filter.fulfilment]})`)

  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty
  // The pre-order view is sorted by what the shop is waiting on rather than by
  // when the order arrived, because that is the question it exists to answer -
  // unless the owner has picked a sort of their own.
  const orderBy = filter.sort
    ? SORT_CLAUSE[filter.sort]
    : filter.preOrder
      ? Prisma.sql`ORDER BY (SELECT MIN("pre_order_dispatch_date") FROM "shp_order_items" WHERE "order_id" = o."id") ASC NULLS LAST`
      : SORT_CLAUSE.newest

  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT o.* FROM "shp_orders" o ${where} ${orderBy} LIMIT ${perPage} OFFSET ${offset}
  `
  const countRows = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "shp_orders" o ${where}`
  return { orders: rows.map(mapOrder), total: Number(countRows[0]?.count ?? 0) }
}

// What a row on the orders list needs beyond the order itself: how big it is,
// how much of it has gone out, and whether any of it is a pre-order. Fetched
// for a whole page of orders in one query rather than per row, so a page of 50
// orders is two round trips in total, not fifty-one.
export type OrderRowMetrics = {
  lineCount: number
  unitCount: number
  refundedUnits: number
  dispatchedUnits: number
  outstandingUnits: number
  hasPreOrder: boolean
}

export async function getOrderRowMetrics(orderIds: string[]): Promise<Record<string, OrderRowMetrics>> {
  if (orderIds.length === 0) return {}
  const rows = await prisma.$queryRaw<Array<{
    order_id: string
    line_count: number
    unit_count: number
    refunded_units: number
    dispatched_units: number
    outstanding_units: number
    has_pre_order: boolean
  }>>`
    SELECT oi."order_id" AS order_id,
           COUNT(*)::int AS line_count,
           COALESCE(SUM(oi."quantity"), 0)::int AS unit_count,
           COALESCE(SUM(oi."refunded_qty"), 0)::int AS refunded_units,
           COALESCE(SUM(COALESCE(sent."qty", 0)), 0)::int AS dispatched_units,
           COALESCE(SUM(GREATEST(oi."quantity" - oi."refunded_qty" - COALESCE(sent."qty", 0), 0)), 0)::int AS outstanding_units,
           BOOL_OR(oi."is_pre_order") AS has_pre_order
    FROM "shp_order_items" oi
    LEFT JOIN (
      SELECT si."order_item_id" AS order_item_id, SUM(si."quantity")::int AS qty
      FROM "shp_shipment_items" si GROUP BY si."order_item_id"
    ) sent ON sent."order_item_id" = oi."id"
    WHERE oi."order_id" IN (${Prisma.join(orderIds)})
    GROUP BY oi."order_id"
  `
  const out: Record<string, OrderRowMetrics> = {}
  for (const r of rows) {
    out[r.order_id] = {
      lineCount: r.line_count,
      unitCount: r.unit_count,
      refundedUnits: r.refunded_units,
      dispatchedUnits: r.dispatched_units,
      outstandingUnits: r.outstanding_units,
      hasPreOrder: r.has_pre_order,
    }
  }
  return out
}

// The numbers worth putting at the top of the orders screen. Counted over the
// whole shop rather than the current filter on purpose: they are there to say
// what still needs doing, and a filter that hides the work would defeat the
// point of showing them.
//
// Each counter is defined as exactly the filter its tile links through to, so
// clicking "3 to send" always lands on three orders. Any counter that cannot be
// expressed as a filter belongs on a tile that does not link anywhere.
export type OrdersOverview = {
  awaitingPayment: number
  toDispatch: number
  preOrdersOutstanding: number
  paidOrders30d: number
  revenue30d: string
}

export async function getOrdersOverview(): Promise<OrdersOverview> {
  const rows = await prisma.$queryRaw<Array<{
    awaiting_payment: number
    to_dispatch: number
    pre_orders_outstanding: number
    paid_orders_30d: number
    revenue_30d: { toString(): string }
  }>>`
    SELECT
      COUNT(*) FILTER (WHERE ${UNPAID_SQL} AND ${OPEN_ONLY_SQL})::int AS awaiting_payment,
      COUNT(*) FILTER (
        WHERE o."payment_status" = 'PAID'
          AND ${OPEN_ONLY_SQL}
          AND ${FULFILMENT_CONDITION.UNDISPATCHED}
      )::int AS to_dispatch,
      COUNT(*) FILTER (
        WHERE ${OPEN_ONLY_SQL}
          AND EXISTS (
            SELECT 1 FROM "shp_order_items" oi_p
            WHERE oi_p."order_id" = o."id" AND oi_p."is_pre_order" = true
          )
      )::int AS pre_orders_outstanding,
      COUNT(*) FILTER (
        WHERE o."payment_status" = 'PAID' AND o."paid_at" >= NOW() - INTERVAL '30 days'
      )::int AS paid_orders_30d,
      COALESCE(SUM(o."total") FILTER (
        WHERE o."payment_status" = 'PAID' AND o."paid_at" >= NOW() - INTERVAL '30 days'
      ), 0) AS revenue_30d
    FROM "shp_orders" o
  `
  const r = rows[0]
  return {
    awaitingPayment: r?.awaiting_payment ?? 0,
    toDispatch: r?.to_dispatch ?? 0,
    preOrdersOutstanding: r?.pre_orders_outstanding ?? 0,
    paidOrders30d: r?.paid_orders_30d ?? 0,
    revenue30d: r?.revenue_30d ? r.revenue_30d.toString() : '0',
  }
}

// How this customer has behaved before, for the panel on a single order. Prior
// orders are the ones that are not this one, so an order always reads as "their
// third" rather than counting itself.
export type CustomerSummary = { orderCount: number; paidOrderCount: number; totalSpent: string; firstOrderAt: Date | null }

export async function getCustomerSummary(email: string): Promise<CustomerSummary> {
  const rows = await prisma.$queryRaw<Array<{ order_count: number; paid_order_count: number; total_spent: { toString(): string }; first_order_at: Date | null }>>`
    SELECT COUNT(*)::int AS order_count,
           COUNT(*) FILTER (WHERE "payment_status" = 'PAID')::int AS paid_order_count,
           COALESCE(SUM("total") FILTER (WHERE "payment_status" = 'PAID'), 0) AS total_spent,
           MIN("created_at") AS first_order_at
    FROM "shp_orders" WHERE lower("customer_email") = lower(${email})
  `
  const r = rows[0]
  return {
    orderCount: r?.order_count ?? 0,
    paidOrderCount: r?.paid_order_count ?? 0,
    totalSpent: r?.total_spent ? r.total_spent.toString() : '0',
    firstOrderAt: r?.first_order_at ?? null,
  }
}

export async function listOrdersByEmail(email: string): Promise<ShpOrder[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_orders" WHERE lower("customer_email") = lower(${email}) ORDER BY "created_at" DESC
  `
  return rows.map(mapOrder)
}

export async function listOrdersByMemberId(memberId: string): Promise<ShpOrder[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_orders" WHERE "member_id" = ${memberId} ORDER BY "created_at" DESC
  `
  return rows.map(mapOrder)
}

// Hands a member the guest orders they placed at the same email address.
//
// Without this the post-purchase "create an account" prompt is a promise the
// shop cannot keep: the order's member_id is fixed at checkout from whatever
// cookie was present, so a shopper who registers ten seconds after paying gets
// an account whose order history is empty - the one thing they made it for.
//
// The email match is only safe once the member has PROVED they own the address,
// which is why callers pass `emailVerified` rather than this reading the flag
// itself: an unverified sign-up at someone else's address would otherwise be
// handed that person's order history, addresses and all. On a shop with email
// verification switched off nothing is ever claimed, which is the right way
// round - a missing order history is a nuisance, the alternative is a leak.
//
// Idempotent: the member_id IS NULL guard means an order already claimed by
// anyone (including this member) is never touched, so this can run on every
// visit to the order list without a second thought.
export async function claimGuestOrdersForMember(memberId: string, email: string): Promise<number> {
  const result = await prisma.$executeRaw`
    UPDATE "shp_orders"
    SET "member_id" = ${memberId}, "updated_at" = CURRENT_TIMESTAMP
    WHERE "member_id" IS NULL AND lower("customer_email") = lower(${email})
  `
  return result
}

export async function countPriorOrdersByEmail(email: string, excludeOrderId?: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "shp_orders"
    WHERE lower("customer_email") = lower(${email}) AND "payment_status" = 'PAID'
      AND "id" != ${excludeOrderId ?? ''}
  `
  return Number(rows[0]?.count ?? 0)
}

// Counts prior PAID orders by this email that actually used the given coupon -
// the correct basis for a coupon's per-customer limit (countPriorOrdersByEmail
// counts every order regardless of coupon, which both over- and under-counts).
// Keyed on the resolved coupon_id, never the raw coupon_code: a code is only
// stored on an order when it genuinely resolved to a coupon, and the id is
// immune to a coupon later being renamed.
export async function countPriorCouponOrdersByEmail(email: string, couponId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "shp_orders"
    WHERE lower("customer_email") = lower(${email}) AND "payment_status" = 'PAID'
      AND "coupon_id" = ${couponId}
  `
  return Number(rows[0]?.count ?? 0)
}

export async function incrementRefundedQty(orderItemId: string, qty: number): Promise<void> {
  await prisma.$executeRaw`UPDATE "shp_order_items" SET "refunded_qty" = "refunded_qty" + ${qty} WHERE "id" = ${orderItemId}`
}

export async function getOrderIdsForItems(orderItemIds: string[]): Promise<string[]> {
  if (orderItemIds.length === 0) return []
  const rows = await prisma.$queryRaw<{ order_id: string }[]>`
    SELECT DISTINCT "order_id" FROM "shp_order_items" WHERE "id" IN (${Prisma.join(orderItemIds)})
  `
  return rows.map((r) => r.order_id)
}

// ---------------------------------------------------------------------------
// Notes and email log
// ---------------------------------------------------------------------------

export async function addOrderNote(orderId: string, content: string, isInternal: boolean, createdBy: string | null): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "shp_order_notes" ("order_id", "content", "is_internal", "created_by") VALUES (${orderId}, ${content}, ${isInternal}, ${createdBy})
  `
}

// Mapped to camelCase like every other read in this file. It used to hand back
// raw rows, so `isInternal` and `createdAt` were simply undefined on the admin
// screen while `content` happened to work - the kind of quiet mismatch that only
// shows up as a blank timestamp.
export type OrderNoteRow = { id: string; content: string; isInternal: boolean; createdBy: string | null; createdAt: Date }

export async function listOrderNotes(orderId: string): Promise<OrderNoteRow[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_order_notes" WHERE "order_id" = ${orderId} ORDER BY "created_at" ASC`
  return rows.map((r) => ({
    id: r.id as string,
    content: r.content as string,
    isInternal: r.is_internal as boolean,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: r.created_at as Date,
  }))
}

export async function logOrderEmail(orderId: string, subject: string, to: string, trigger: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "shp_order_emails" ("order_id", "subject", "to", "trigger") VALUES (${orderId}, ${subject}, ${to}, ${trigger})
  `
}

export type OrderEmailRow = { id: string; subject: string; to: string; trigger: string; sentAt: Date }

export async function listOrderEmails(orderId: string): Promise<OrderEmailRow[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_order_emails" WHERE "order_id" = ${orderId} ORDER BY "sent_at" ASC`
  return rows.map((r) => ({
    id: r.id as string,
    subject: r.subject as string,
    to: r.to as string,
    trigger: r.trigger as string,
    sentAt: r.sent_at as Date,
  }))
}
