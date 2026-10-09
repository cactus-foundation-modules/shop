import { prisma, type PrismaTransactionClient } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { ShpCoupon, ShpAutomaticDiscount, ShpAutomaticDiscountScope, ShpDiscountType } from '@/modules/shop/lib/types'

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

function mapAutoDiscount(r: Record<string, unknown>, products: ShpAutomaticDiscount['products']): ShpAutomaticDiscount {
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
    appliesTo: r.applies_to === 'PRODUCTS' ? 'PRODUCTS' : 'ALL',
    products,
    minimumQuantity: (r.minimum_quantity as number | null) ?? null,
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

// By id, which is what an order keeps: the code on a paid order may since have
// been renamed.
export async function getCouponById(id: string): Promise<ShpCoupon | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_coupons" WHERE "id" = ${id} LIMIT 1`
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
  invalidateCouponPresenceCache()
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
  invalidateCouponPresenceCache()
}

export async function deleteCoupon(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_coupons" WHERE "id" = ${id}`
  invalidateCouponPresenceCache()
}

// Is there any code a shopper could actually redeem right now? The basket asks
// before it offers a coupon box at all - a shop that has never made a code
// should not invite one. Deliberately the same four conditions resolveDiscounts
// enforces (live, started, not expired, not exhausted); a minimum-order-value it
// cannot meet yet still counts, because the shopper can go and meet it.
//
// EXISTS, not a count: it stops at the first row. Cached for the same 5 seconds
// the shop config is, since this rides along on that same call, and cleared
// outright whenever a coupon is written so a newly created code shows up at once.
let cachedHasCoupons: boolean | null = null
let cachedHasCouponsAt = 0
const COUPON_PRESENCE_TTL_MS = 5_000

export function invalidateCouponPresenceCache(): void {
  cachedHasCoupons = null
  cachedHasCouponsAt = 0
}

export async function hasRedeemableCoupons(): Promise<boolean> {
  const now = Date.now()
  if (cachedHasCoupons !== null && now - cachedHasCouponsAt < COUPON_PRESENCE_TTL_MS) return cachedHasCoupons
  const rows = await prisma.$queryRaw<{ present: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM "shp_coupons"
      WHERE "is_active" = true
        AND ("starts_at" IS NULL OR "starts_at" <= NOW())
        AND ("expires_at" IS NULL OR "expires_at" > NOW())
        AND ("usage_limit" IS NULL OR "usage_count" < "usage_limit")
    ) AS "present"
  `
  const present = rows[0]?.present ?? false
  cachedHasCoupons = present
  cachedHasCouponsAt = now
  return present
}

// Atomic, limit-guarded increment. The pre-checkout check in resolveDiscounts is
// advisory (TOCTOU-racy under concurrent checkouts); this single conditional
// UPDATE is the real enforcement - it can never push usage_count past
// usage_limit. Returns false when the coupon was already exhausted, so callers
// can tell a redemption lost the race.
export async function incrementCouponUsage(id: string): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE "shp_coupons" SET "usage_count" = "usage_count" + 1
    WHERE "id" = ${id} AND ("usage_limit" IS NULL OR "usage_count" < "usage_limit")
  `
  // A redemption can be the one that exhausts the code, which changes the answer
  // above for everyone else.
  invalidateCouponPresenceCache()
  return result > 0
}

export async function listAutomaticDiscounts(activeOnly = false): Promise<ShpAutomaticDiscount[]> {
  const rows = activeOnly
    ? await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT * FROM "shp_automatic_discounts"
        WHERE "is_active" = true AND ("starts_at" IS NULL OR "starts_at" <= NOW()) AND ("expires_at" IS NULL OR "expires_at" >= NOW())
        ORDER BY "priority" DESC
      `
    : await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_automatic_discounts" ORDER BY "priority" DESC`
  // The products only for the rules that have any: the checkout calls this on
  // every total, and a shop with nothing but whole-basket rules should not pay
  // a second query for them.
  const scopedIds = rows.filter((r) => r.applies_to === 'PRODUCTS').map((r) => r.id as string)
  const productsByDiscount = new Map<string, ShpAutomaticDiscount['products']>()
  if (scopedIds.length > 0) {
    const links = await prisma.$queryRaw<Array<{ discount_id: string; product_id: string; name: string }>>`
      SELECT l."discount_id", l."product_id", p."name"
      FROM "shp_automatic_discount_products" l
      JOIN "shp_products" p ON p."id" = l."product_id"
      WHERE l."discount_id" IN (${Prisma.join(scopedIds)})
      ORDER BY p."name"
    `
    for (const link of links) {
      const list = productsByDiscount.get(link.discount_id) ?? []
      list.push({ id: link.product_id, name: link.name })
      productsByDiscount.set(link.discount_id, list)
    }
  }
  return rows.map((r) => mapAutoDiscount(r, productsByDiscount.get(r.id as string) ?? []))
}

type AutomaticDiscountFields = {
  name: string; type: ShpDiscountType; value: number | null; minimumOrderValue: number | null
  freeShippingThreshold: number | null; startsAt: Date | null; expiresAt: Date | null; priority: number; isActive: boolean
  appliesTo: ShpAutomaticDiscountScope; productIds: string[]; minimumQuantity: number | null
}

// The rule's product list is replaced whole, in the same transaction as the
// row, so a save can never leave a rule pointed at half of what was picked.
async function replaceDiscountProducts(tx: PrismaTransactionClient, id: string, productIds: string[]): Promise<void> {
  await tx.$executeRaw`DELETE FROM "shp_automatic_discount_products" WHERE "discount_id" = ${id}`
  const unique = [...new Set(productIds)]
  if (unique.length === 0) return
  await tx.$executeRaw`
    INSERT INTO "shp_automatic_discount_products" ("discount_id", "product_id")
    SELECT ${id}, p."id" FROM "shp_products" p WHERE p."id" IN (${Prisma.join(unique)})
    ON CONFLICT DO NOTHING
  `
}

export async function createAutomaticDiscount(data: Partial<AutomaticDiscountFields> & { name: string; type: ShpDiscountType }): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<[{ id: string }]>`
      INSERT INTO "shp_automatic_discounts" ("name", "type", "value", "minimum_order_value", "free_shipping_threshold", "starts_at", "expires_at", "priority", "applies_to", "minimum_quantity")
      VALUES (${data.name}, ${data.type}, ${data.value ?? null}, ${data.minimumOrderValue ?? null}, ${data.freeShippingThreshold ?? null}, ${data.startsAt ?? null}, ${data.expiresAt ?? null}, ${data.priority ?? 0}, ${data.appliesTo ?? 'ALL'}, ${data.minimumQuantity ?? null})
      RETURNING "id"
    `
    if (data.productIds?.length) await replaceDiscountProducts(tx, rows[0].id, data.productIds)
    return rows[0]
  })
}

export async function updateAutomaticDiscount(id: string, fields: Partial<AutomaticDiscountFields>): Promise<void> {
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
  if (fields.appliesTo !== undefined) sets.push(Prisma.sql`"applies_to" = ${fields.appliesTo}`)
  if (fields.minimumQuantity !== undefined) sets.push(Prisma.sql`"minimum_quantity" = ${fields.minimumQuantity}`)
  if (sets.length === 0 && fields.productIds === undefined) return
  sets.push(Prisma.sql`"updated_at" = CURRENT_TIMESTAMP`)
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "shp_automatic_discounts" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${id}`
    if (fields.productIds !== undefined) await replaceDiscountProducts(tx, id, fields.productIds)
  })
}

export async function deleteAutomaticDiscount(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_automatic_discounts" WHERE "id" = ${id}`
}
