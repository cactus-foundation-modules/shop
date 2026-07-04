import { prisma } from '@/lib/db/prisma'
import type { ShpRefund, ShpRefundItem } from '@/modules/shop/lib/types'

function mapRefund(r: Record<string, unknown>): ShpRefund {
  return {
    id: r.id as string,
    orderId: r.order_id as string,
    amount: (r.amount as { toString(): string }).toString(),
    reason: (r.reason as string | null) ?? null,
    providerRefundId: (r.provider_refund_id as string | null) ?? null,
    status: r.status as ShpRefund['status'],
    createdBy: r.created_by as string,
    createdAt: r.created_at as Date,
  }
}

function mapRefundItem(r: Record<string, unknown>): ShpRefundItem {
  return {
    id: r.id as string,
    refundId: r.refund_id as string,
    orderItemId: r.order_item_id as string,
    quantity: r.quantity as number,
    amount: (r.amount as { toString(): string }).toString(),
  }
}

export async function listRefundsForOrder(orderId: string): Promise<ShpRefund[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_refunds" WHERE "order_id" = ${orderId} ORDER BY "created_at" ASC`
  return rows.map(mapRefund)
}

export async function getRefundItems(refundId: string): Promise<ShpRefundItem[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_refund_items" WHERE "refund_id" = ${refundId}`
  return rows.map(mapRefundItem)
}

export type CreateRefundInput = {
  orderId: string
  amount: number
  reason: string | null
  providerRefundId: string | null
  status: ShpRefund['status']
  createdBy: string
  items: Array<{ orderItemId: string; quantity: number; amount: number }>
}

export async function createRefund(data: CreateRefundInput): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<[{ id: string }]>`
      INSERT INTO "shp_refunds" ("order_id", "amount", "reason", "provider_refund_id", "status", "created_by")
      VALUES (${data.orderId}, ${data.amount}, ${data.reason}, ${data.providerRefundId}, ${data.status}, ${data.createdBy})
      RETURNING "id"
    `
    const refundId = rows[0].id
    for (const item of data.items) {
      await tx.$executeRaw`
        INSERT INTO "shp_refund_items" ("refund_id", "order_item_id", "quantity", "amount")
        VALUES (${refundId}, ${item.orderItemId}, ${item.quantity}, ${item.amount})
      `
      await tx.$executeRaw`UPDATE "shp_order_items" SET "refunded_qty" = "refunded_qty" + ${item.quantity} WHERE "id" = ${item.orderItemId}`
    }
    return { id: refundId }
  })
}
