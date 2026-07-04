import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { ShpBackInStockSubscription } from '@/modules/shop/lib/types'

function mapSub(r: Record<string, unknown>): ShpBackInStockSubscription {
  return {
    id: r.id as string,
    productId: r.product_id as string,
    email: r.email as string,
    memberId: (r.member_id as string | null) ?? null,
    notifiedAt: (r.notified_at as Date | null) ?? null,
    createdAt: r.created_at as Date,
  }
}

// Idempotent subscribe (addendum A.4) - ON CONFLICT DO NOTHING means a repeat
// subscribe from the same email just returns 200 without erroring.
export async function subscribeBackInStock(productId: string, email: string, memberId: string | null): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "shp_back_in_stock_subscriptions" ("product_id", "email", "member_id")
    VALUES (${productId}, ${email}, ${memberId})
    ON CONFLICT ("product_id", "email") DO NOTHING
  `
}

export async function unsubscribeBackInStock(productId: string, email: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_back_in_stock_subscriptions" WHERE "product_id" = ${productId} AND "email" = ${email}`
}

export async function getUnnotifiedSubscribers(productId: string): Promise<ShpBackInStockSubscription[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_back_in_stock_subscriptions" WHERE "product_id" = ${productId} AND "notified_at" IS NULL
  `
  return rows.map(mapSub)
}

export async function markSubscribersNotified(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await prisma.$executeRaw`
    UPDATE "shp_back_in_stock_subscriptions" SET "notified_at" = CURRENT_TIMESTAMP WHERE "id" IN (${Prisma.join(ids)})
  `
}

export async function listSubscriptions(filter: { productId?: string; page?: number; perPage?: number }): Promise<{ subscriptions: ShpBackInStockSubscription[]; total: number }> {
  const page = Math.max(1, Math.floor(Number(filter.page)) || 1)
  const perPage = Math.min(100, Math.max(1, Math.floor(Number(filter.perPage)) || 50))
  const offset = (page - 1) * perPage
  const where = filter.productId ? Prisma.sql`WHERE "product_id" = ${filter.productId}` : Prisma.empty
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_back_in_stock_subscriptions" ${where} ORDER BY "created_at" DESC LIMIT ${perPage} OFFSET ${offset}
  `
  const countRows = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "shp_back_in_stock_subscriptions" ${where}`
  return { subscriptions: rows.map(mapSub), total: Number(countRows[0]?.count ?? 0) }
}
