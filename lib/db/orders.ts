import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { ShpAddress, ShpOrder, ShpOrderItem, ShpOrderStatus, ShpPaymentMethod, ShpPaymentStatus } from '@/modules/shop/lib/types'

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

export async function getOrderItems(orderId: string): Promise<ShpOrderItem[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_order_items" WHERE "order_id" = ${orderId} ORDER BY "id" ASC`
  return rows.map(mapOrderItem)
}

export async function getOrderItemById(id: string): Promise<ShpOrderItem | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_order_items" WHERE "id" = ${id} LIMIT 1`
  return rows[0] ? mapOrderItem(rows[0]) : null
}

export type CreateOrderInput = {
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
  }>
}

// Creates the PENDING order row + item snapshot in one transaction (Q8 - the
// order exists before the payment intent, so a webhook/confirm can always
// find something to update, even if the shopper abandons checkout).
export async function createPendingOrder(data: CreateOrderInput): Promise<{ id: string; orderNumber: string }> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<[{ id: string }]>`
      INSERT INTO "shp_orders" (
        "order_number", "member_id", "customer_email", "customer_name", "customer_phone",
        "shipping_address", "billing_address", "subtotal", "discount_amount", "shipping_amount",
        "tax_amount", "total", "tax_mode", "currency", "coupon_id", "coupon_code",
        "payment_method", "shipping_rate_id", "shipping_rate_name"
      ) VALUES (
        ${data.orderNumber}, ${data.memberId ?? null}, ${data.customerEmail}, ${data.customerName}, ${data.customerPhone ?? null},
        ${JSON.stringify(data.shippingAddress)}::jsonb, ${data.billingAddress ? JSON.stringify(data.billingAddress) : null}::jsonb,
        ${data.subtotal}, ${data.discountAmount}, ${data.shippingAmount}, ${data.taxAmount}, ${data.total},
        ${data.taxMode}, ${data.currency}, ${data.couponId ?? null}, ${data.couponCode ?? null},
        ${data.paymentMethod}, ${data.shippingRateId ?? null}, ${data.shippingRateName ?? null}
      )
      RETURNING "id"
    `
    const orderId = rows[0].id
    for (const item of data.items) {
      await tx.$executeRaw`
        INSERT INTO "shp_order_items" (
          "order_id", "product_id", "product_name", "product_sku", "product_type",
          "quantity", "unit_price", "tax_rate", "tax_amount", "total", "is_pre_order", "pre_order_dispatch_date"
        ) VALUES (
          ${orderId}, ${item.productId}, ${item.productName}, ${item.productSku}, ${item.productType},
          ${item.quantity}, ${item.unitPrice}, ${item.taxRate}, ${item.taxAmount}, ${item.total},
          ${item.isPreOrder}, ${item.preOrderDispatchDate}
        )
      `
    }
    return { id: orderId, orderNumber: data.orderNumber }
  })
}

export async function updateOrderStatus(id: string, status: ShpOrderStatus): Promise<void> {
  await prisma.$executeRaw`UPDATE "shp_orders" SET "status" = ${status}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${id}`
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

export async function markOrderPaymentFailed(id: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_orders" SET "payment_status" = 'FAILED', "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id} AND "payment_status" = 'PENDING'
  `
}

export async function markOrderAwaitingConfirmation(id: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_orders" SET "payment_status" = 'AWAITING_CONFIRMATION', "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${id}
  `
}

export async function confirmManualPayment(id: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "shp_orders" SET "payment_status" = 'PAID', "paid_at" = CURRENT_TIMESTAMP, "status" = 'PROCESSING', "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id}
  `
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

export type ListOrdersFilter = {
  page?: number
  perPage?: number
  status?: ShpOrderStatus
  paymentStatus?: ShpPaymentStatus
  search?: string
  preOrder?: boolean
  dateFrom?: Date
  dateTo?: Date
}

export async function listOrders(filter: ListOrdersFilter): Promise<{ orders: ShpOrder[]; total: number }> {
  const page = filter.page ?? 1
  const perPage = filter.perPage ?? 25
  const offset = (page - 1) * perPage

  const conditions: Prisma.Sql[] = []
  if (filter.status) conditions.push(Prisma.sql`o."status" = ${filter.status}`)
  if (filter.paymentStatus) conditions.push(Prisma.sql`o."payment_status" = ${filter.paymentStatus}`)
  if (filter.search) conditions.push(Prisma.sql`(o."order_number" ILIKE ${`%${filter.search}%`} OR o."customer_email" ILIKE ${`%${filter.search}%`} OR o."customer_name" ILIKE ${`%${filter.search}%`})`)
  if (filter.dateFrom) conditions.push(Prisma.sql`o."created_at" >= ${filter.dateFrom}`)
  if (filter.dateTo) conditions.push(Prisma.sql`o."created_at" <= ${filter.dateTo}`)
  if (filter.preOrder) {
    conditions.push(Prisma.sql`o."id" IN (SELECT "order_id" FROM "shp_order_items" WHERE "is_pre_order" = true)`)
  }

  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty
  const orderBy = filter.preOrder
    ? Prisma.sql`ORDER BY (SELECT MIN("pre_order_dispatch_date") FROM "shp_order_items" WHERE "order_id" = o."id") ASC NULLS LAST`
    : Prisma.sql`ORDER BY o."created_at" DESC`

  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT o.* FROM "shp_orders" o ${where} ${orderBy} LIMIT ${perPage} OFFSET ${offset}
  `
  const countRows = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "shp_orders" o ${where}`
  return { orders: rows.map(mapOrder), total: Number(countRows[0]?.count ?? 0) }
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

export async function countPriorOrdersByEmail(email: string, excludeOrderId?: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "shp_orders"
    WHERE lower("customer_email") = lower(${email}) AND "payment_status" = 'PAID'
      AND "id" != ${excludeOrderId ?? ''}
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

export async function listOrderNotes(orderId: string) {
  return prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_order_notes" WHERE "order_id" = ${orderId} ORDER BY "created_at" ASC`
}

export async function logOrderEmail(orderId: string, subject: string, to: string, trigger: string): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "shp_order_emails" ("order_id", "subject", "to", "trigger") VALUES (${orderId}, ${subject}, ${to}, ${trigger})
  `
}

export async function listOrderEmails(orderId: string) {
  return prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_order_emails" WHERE "order_id" = ${orderId} ORDER BY "sent_at" ASC`
}
