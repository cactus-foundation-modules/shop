import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

// Reading and writing shp_stock_movements. The decision about WHETHER a count
// should move lives in lib/stock.ts; this file only writes down that it did.

export type ShpStockMovement = {
  id: string
  productId: string
  productName: string | null
  delta: number
  qtyBefore: number | null
  qtyAfter: number | null
  reason: string
  reference: string | null
  source: string
  userId: string | null
  note: string | null
  createdAt: string
}

export type StockMovementInput = {
  productId: string
  delta: number
  qtyBefore: number | null
  qtyAfter: number | null
  reason: string
  reference: string | null
  source: string
  userId: string | null
  note: string | null
}

/** The client a $transaction callback is handed. Taken off prisma's own type
 *  rather than Prisma.TransactionClient: the extended client this project
 *  builds is not assignable to the plain one. */
type Tx = Pick<typeof prisma, '$executeRaw' | '$queryRaw'>

export async function recordStockMovement(tx: Tx, input: StockMovementInput): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "shp_stock_movements" (
      "product_id", "delta", "qty_before", "qty_after", "reason", "reference", "source", "user_id", "note"
    ) VALUES (
      ${input.productId}, ${input.delta}, ${input.qtyBefore}, ${input.qtyAfter},
      ${input.reason}, ${input.reference}, ${input.source}, ${input.userId}, ${input.note}
    )
  `
}

/** What has moved this product's count, newest first. */
export async function listStockMovements(
  productId: string,
  limit = 50,
): Promise<ShpStockMovement[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT m.*, p."name" AS "product_name"
      FROM "shp_stock_movements" m
      LEFT JOIN "shp_products" p ON p."id" = m."product_id"
     WHERE m."product_id" = ${productId}
     ORDER BY m."created_at" DESC
     LIMIT ${Prisma.raw(String(Math.max(1, Math.min(500, Math.trunc(limit)))))}
  `
  return rows.map(mapMovement)
}

function mapMovement(r: Record<string, unknown>): ShpStockMovement {
  return {
    id: r.id as string,
    productId: r.product_id as string,
    productName: (r.product_name as string | null) ?? null,
    delta: Number(r.delta ?? 0),
    qtyBefore: r.qty_before === null || r.qty_before === undefined ? null : Number(r.qty_before),
    qtyAfter: r.qty_after === null || r.qty_after === undefined ? null : Number(r.qty_after),
    reason: r.reason as string,
    reference: (r.reference as string | null) ?? null,
    source: (r.source as string | null) ?? 'shop',
    userId: (r.user_id as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    createdAt: (r.created_at as Date).toISOString(),
  }
}
