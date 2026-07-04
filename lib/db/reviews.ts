import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { ShpReview, ShpReviewStatus } from '@/modules/shop/lib/types'

function mapReview(r: Record<string, unknown>): ShpReview {
  return {
    id: r.id as string,
    productId: r.product_id as string,
    memberId: (r.member_id as string | null) ?? null,
    authorName: r.author_name as string,
    rating: r.rating as number,
    title: (r.title as string | null) ?? null,
    body: (r.body as string | null) ?? null,
    isVerified: r.is_verified as boolean,
    status: r.status as ShpReviewStatus,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

export async function listApprovedReviewsForProduct(productId: string): Promise<ShpReview[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_reviews" WHERE "product_id" = ${productId} AND "status" = 'APPROVED' ORDER BY "created_at" DESC
  `
  return rows.map(mapReview)
}

export async function listReviews(filter: { status?: ShpReviewStatus; productId?: string; page?: number; perPage?: number }): Promise<{ reviews: ShpReview[]; total: number }> {
  const page = filter.page ?? 1
  const perPage = filter.perPage ?? 25
  const offset = (page - 1) * perPage
  const conditions: Prisma.Sql[] = []
  if (filter.status) conditions.push(Prisma.sql`"status" = ${filter.status}`)
  if (filter.productId) conditions.push(Prisma.sql`"product_id" = ${filter.productId}`)
  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_reviews" ${where} ORDER BY "created_at" DESC LIMIT ${perPage} OFFSET ${offset}
  `
  const countRows = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "shp_reviews" ${where}`
  return { reviews: rows.map(mapReview), total: Number(countRows[0]?.count ?? 0) }
}

export async function hasReviewedProduct(productId: string, memberId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM "shp_reviews" WHERE "product_id" = ${productId} AND "member_id" = ${memberId}) AS "exists"
  `
  return rows[0]?.exists ?? false
}

export async function createReview(data: {
  productId: string; memberId: string | null; authorName: string; rating: number
  title?: string | null; body?: string | null; isVerified: boolean
}): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_reviews" ("product_id", "member_id", "author_name", "rating", "title", "body", "is_verified")
    VALUES (${data.productId}, ${data.memberId}, ${data.authorName}, ${data.rating}, ${data.title ?? null}, ${data.body ?? null}, ${data.isVerified})
    RETURNING "id"
  `
  return rows[0]
}

export async function updateReviewStatus(id: string, status: ShpReviewStatus): Promise<ShpReview | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    UPDATE "shp_reviews" SET "status" = ${status}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${id} RETURNING *
  `
  return rows[0] ? mapReview(rows[0]) : null
}

export async function getReviewById(id: string): Promise<ShpReview | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_reviews" WHERE "id" = ${id} LIMIT 1`
  return rows[0] ? mapReview(rows[0]) : null
}

export async function deleteReview(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_reviews" WHERE "id" = ${id}`
}
