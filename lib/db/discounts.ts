import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { ShpCoupon, ShpAutomaticDiscount, ShpDiscountType } from '@/modules/shop/lib/types'

function mapCoupon(r: Record<string, unknown>): ShpCoupon {
  return {
    id: r.id as string,
    code: r.code as string,
    type: r.type as ShpDiscountType,
    value: r.value != null ? (r.value as { toString(): string }).toString() : null,
    minimumOrderValue: r.minimum_order_value != null ? (r.minimum_order_value as { toString(): string }).toString() : null,
    usageLimit: (r.usage_limit as number | null) ?? null,
    usageCount: r.usage_count as number,
    perCustomerLimit: (r.per_customer_limit as number | null) ?? null,
    startsAt: (r.starts_at as Date | null) ?? null,
    expiresAt: (r.expires_at as Date | null) ?? null,
    isActive: r.is_active as boolean,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

function mapAutoDiscount(r: Record<string, unknown>): ShpAutomaticDiscount {
  return {
    id: r.id as string,
    name: r.name as string,
    type: r.type as ShpDiscountType,
    value: r.value != null ? (r.value as { toString(): string }).toString() : null,
    minimumOrderValue: r.minimum_order_value != null ? (r.minimum_order_value as { toString(): string }).toString() : null,
    freeShippingThreshold: r.free_shipping_threshold != null ? (r.free_shipping_threshold as { toString(): string }).toString() : null,
    startsAt: (r.starts_at as Date | null) ?? null,
    expiresAt: (r.expires_at as Date | null) ?? null,
    isActive: r.is_active as boolean,
    priority: r.priority as number,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

export async function listCoupons(): Promise<ShpCoupon[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_coupons" ORDER BY "created_at" DESC`
  return rows.map(mapCoupon)
}

export async function getCouponByCode(code: string): Promise<ShpCoupon | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_coupons" WHERE lower("code") = lower(${code}) LIMIT 1`
  return rows[0] ? mapCoupon(rows[0]) : null
}

export async function createCoupon(data: {
  code: string; type: ShpDiscountType; value?: number | null; minimumOrderValue?: number | null
  usageLimit?: number | null; perCustomerLimit?: number | null; startsAt?: Date | null; expiresAt?: Date | null
}): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_coupons" ("code", "type", "value", "minimum_order_value", "usage_limit", "per_customer_limit", "starts_at", "expires_at")
    VALUES (${data.code}, ${data.type}, ${data.value ?? null}, ${data.minimumOrderValue ?? null}, ${data.usageLimit ?? null}, ${data.perCustomerLimit ?? null}, ${data.startsAt ?? null}, ${data.expiresAt ?? null})
    RETURNING "id"
  `
  return rows[0]
}

export async function updateCoupon(id: string, fields: Partial<{
  code: string; type: ShpDiscountType; value: number | null; minimumOrderValue: number | null
  usageLimit: number | null; perCustomerLimit: number | null; startsAt: Date | null; expiresAt: Date | null; isActive: boolean
}>): Promise<void> {
  const sets: Prisma.Sql[] = []
  if (fields.code !== undefined) sets.push(Prisma.sql`"code" = ${fields.code}`)
  if (fields.type !== undefined) sets.push(Prisma.sql`"type" = ${fields.type}`)
  if (fields.value !== undefined) sets.push(Prisma.sql`"value" = ${fields.value}`)
  if (fields.minimumOrderValue !== undefined) sets.push(Prisma.sql`"minimum_order_value" = ${fields.minimumOrderValue}`)
  if (fields.usageLimit !== undefined) sets.push(Prisma.sql`"usage_limit" = ${fields.usageLimit}`)
  if (fields.perCustomerLimit !== undefined) sets.push(Prisma.sql`"per_customer_limit" = ${fields.perCustomerLimit}`)
  if (fields.startsAt !== undefined) sets.push(Prisma.sql`"starts_at" = ${fields.startsAt}`)
  if (fields.expiresAt !== undefined) sets.push(Prisma.sql`"expires_at" = ${fields.expiresAt}`)
  if (fields.isActive !== undefined) sets.push(Prisma.sql`"is_active" = ${fields.isActive}`)
  if (sets.length === 0) return
  sets.push(Prisma.sql`"updated_at" = CURRENT_TIMESTAMP`)
  await prisma.$executeRaw`UPDATE "shp_coupons" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${id}`
}

export async function deleteCoupon(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_coupons" WHERE "id" = ${id}`
}

export async function incrementCouponUsage(id: string): Promise<void> {
  await prisma.$executeRaw`UPDATE "shp_coupons" SET "usage_count" = "usage_count" + 1 WHERE "id" = ${id}`
}

export async function listAutomaticDiscounts(activeOnly = false): Promise<ShpAutomaticDiscount[]> {
  const rows = activeOnly
    ? await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT * FROM "shp_automatic_discounts"
        WHERE "is_active" = true AND ("starts_at" IS NULL OR "starts_at" <= NOW()) AND ("expires_at" IS NULL OR "expires_at" >= NOW())
        ORDER BY "priority" DESC
      `
    : await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_automatic_discounts" ORDER BY "priority" DESC`
  return rows.map(mapAutoDiscount)
}

export async function createAutomaticDiscount(data: {
  name: string; type: ShpDiscountType; value?: number | null; minimumOrderValue?: number | null
  freeShippingThreshold?: number | null; startsAt?: Date | null; expiresAt?: Date | null; priority?: number
}): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_automatic_discounts" ("name", "type", "value", "minimum_order_value", "free_shipping_threshold", "starts_at", "expires_at", "priority")
    VALUES (${data.name}, ${data.type}, ${data.value ?? null}, ${data.minimumOrderValue ?? null}, ${data.freeShippingThreshold ?? null}, ${data.startsAt ?? null}, ${data.expiresAt ?? null}, ${data.priority ?? 0})
    RETURNING "id"
  `
  return rows[0]
}

export async function updateAutomaticDiscount(id: string, fields: Partial<{
  name: string; type: ShpDiscountType; value: number | null; minimumOrderValue: number | null
  freeShippingThreshold: number | null; startsAt: Date | null; expiresAt: Date | null; priority: number; isActive: boolean
}>): Promise<void> {
  const sets: Prisma.Sql[] = []
  if (fields.name !== undefined) sets.push(Prisma.sql`"name" = ${fields.name}`)
  if (fields.type !== undefined) sets.push(Prisma.sql`"type" = ${fields.type}`)
  if (fields.value !== undefined) sets.push(Prisma.sql`"value" = ${fields.value}`)
  if (fields.minimumOrderValue !== undefined) sets.push(Prisma.sql`"minimum_order_value" = ${fields.minimumOrderValue}`)
  if (fields.freeShippingThreshold !== undefined) sets.push(Prisma.sql`"free_shipping_threshold" = ${fields.freeShippingThreshold}`)
  if (fields.startsAt !== undefined) sets.push(Prisma.sql`"starts_at" = ${fields.startsAt}`)
  if (fields.expiresAt !== undefined) sets.push(Prisma.sql`"expires_at" = ${fields.expiresAt}`)
  if (fields.priority !== undefined) sets.push(Prisma.sql`"priority" = ${fields.priority}`)
  if (fields.isActive !== undefined) sets.push(Prisma.sql`"is_active" = ${fields.isActive}`)
  if (sets.length === 0) return
  sets.push(Prisma.sql`"updated_at" = CURRENT_TIMESTAMP`)
  await prisma.$executeRaw`UPDATE "shp_automatic_discounts" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${id}`
}

export async function deleteAutomaticDiscount(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_automatic_discounts" WHERE "id" = ${id}`
}
