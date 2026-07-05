import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { ShpTaxClass, ShpShippingZone, ShpTaxZoneRate, ShpShippingRate } from '@/modules/shop/lib/types'

// ---------------------------------------------------------------------------
// Tax classes
// ---------------------------------------------------------------------------

export async function listTaxClasses(): Promise<ShpTaxClass[]> {
  return prisma.$queryRaw<ShpTaxClass[]>`SELECT "id", "name", "code" FROM "shp_tax_classes" ORDER BY "name" ASC`
}

export async function createTaxClass(name: string, code: string): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_tax_classes" ("name", "code") VALUES (${name}, ${code}) RETURNING "id"
  `
  return rows[0]
}

export async function updateTaxClass(id: string, fields: { name?: string; code?: string }): Promise<void> {
  const sets: Prisma.Sql[] = []
  if (fields.name !== undefined) sets.push(Prisma.sql`"name" = ${fields.name}`)
  if (fields.code !== undefined) sets.push(Prisma.sql`"code" = ${fields.code}`)
  if (sets.length === 0) return
  await prisma.$executeRaw`UPDATE "shp_tax_classes" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${id}`
}

export async function deleteTaxClass(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_tax_classes" WHERE "id" = ${id}`
}

export async function getTaxClassByCode(code: string): Promise<ShpTaxClass | null> {
  const rows = await prisma.$queryRaw<ShpTaxClass[]>`SELECT "id", "name", "code" FROM "shp_tax_classes" WHERE "code" = ${code} LIMIT 1`
  return rows[0] ?? null
}

// ---------------------------------------------------------------------------
// Shipping zones
// ---------------------------------------------------------------------------

function mapZone(r: Record<string, unknown>): ShpShippingZone {
  return {
    id: r.id as string,
    name: r.name as string,
    postcodes: (r.postcodes as string[] | null) ?? [],
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

export async function listShippingZones(): Promise<ShpShippingZone[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_shipping_zones" ORDER BY "name" ASC`
  return rows.map(mapZone)
}

export async function getShippingZoneById(id: string): Promise<ShpShippingZone | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_shipping_zones" WHERE "id" = ${id} LIMIT 1`
  return rows[0] ? mapZone(rows[0]) : null
}

export async function createShippingZone(name: string, postcodes: string[]): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_shipping_zones" ("name", "postcodes") VALUES (${name}, ${JSON.stringify(postcodes)}::jsonb) RETURNING "id"
  `
  return rows[0]
}

export async function updateShippingZone(id: string, fields: { name?: string; postcodes?: string[] }): Promise<void> {
  const sets: Prisma.Sql[] = []
  if (fields.name !== undefined) sets.push(Prisma.sql`"name" = ${fields.name}`)
  if (fields.postcodes !== undefined) sets.push(Prisma.sql`"postcodes" = ${JSON.stringify(fields.postcodes)}::jsonb`)
  if (sets.length === 0) return
  sets.push(Prisma.sql`"updated_at" = CURRENT_TIMESTAMP`)
  await prisma.$executeRaw`UPDATE "shp_shipping_zones" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${id}`
}

export async function deleteShippingZone(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_shipping_zones" WHERE "id" = ${id}`
}

// Longest matching postcode prefix (case-insensitive) wins - a shopper's full
// postcode is checked against each zone's prefix list. A zone with no prefixes
// listed is a catch-all, matched only when no other zone's prefix matches -
// this is how a single "United Kingdom" zone can cover the whole country
// without an admin listing every postcode.
export async function findShippingZoneForPostcode(postcode: string): Promise<ShpShippingZone | null> {
  const zones = await listShippingZones()
  const normalised = postcode.replace(/\s+/g, '').toUpperCase()
  let best: { zone: ShpShippingZone; prefixLen: number } | null = null
  let catchAll: ShpShippingZone | null = null
  for (const zone of zones) {
    if (zone.postcodes.length === 0) { catchAll = catchAll ?? zone; continue }
    for (const raw of zone.postcodes) {
      const prefix = raw.replace(/\s+/g, '').toUpperCase()
      if (prefix && normalised.startsWith(prefix) && (!best || prefix.length > best.prefixLen)) {
        best = { zone, prefixLen: prefix.length }
      }
    }
  }
  return best?.zone ?? catchAll
}

// ---------------------------------------------------------------------------
// Tax zone rates
// ---------------------------------------------------------------------------

export async function listTaxZoneRates(zoneId?: string): Promise<ShpTaxZoneRate[]> {
  const rows = zoneId
    ? await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_tax_zone_rates" WHERE "zone_id" = ${zoneId}`
    : await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_tax_zone_rates"`
  return rows.map((r) => ({ id: r.id as string, zoneId: r.zone_id as string, taxClassId: r.tax_class_id as string, rate: (r.rate as { toString(): string }).toString() }))
}

export async function upsertTaxZoneRate(zoneId: string, taxClassId: string, rate: number): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "shp_tax_zone_rates" ("zone_id", "tax_class_id", "rate") VALUES (${zoneId}, ${taxClassId}, ${rate})
    ON CONFLICT ("zone_id", "tax_class_id") DO UPDATE SET "rate" = ${rate}
  `
}

export async function deleteTaxZoneRate(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_tax_zone_rates" WHERE "id" = ${id}`
}

export async function getTaxRateForZoneAndClass(zoneId: string, taxClassId: string | null): Promise<number> {
  if (!taxClassId) return 0
  const rows = await prisma.$queryRaw<{ rate: { toString(): string } }[]>`
    SELECT "rate" FROM "shp_tax_zone_rates" WHERE "zone_id" = ${zoneId} AND "tax_class_id" = ${taxClassId} LIMIT 1
  `
  return rows[0] ? Number(rows[0].rate.toString()) : 0
}

// ---------------------------------------------------------------------------
// Shipping rates
// ---------------------------------------------------------------------------

function mapRate(r: Record<string, unknown>): ShpShippingRate {
  return {
    id: r.id as string,
    zoneId: r.zone_id as string,
    name: r.name as string,
    type: r.type as ShpShippingRate['type'],
    flatRate: r.flat_rate != null ? (r.flat_rate as { toString(): string }).toString() : null,
    weightRates: (r.weight_rates as ShpShippingRate['weightRates']) ?? null,
    freeThreshold: r.free_threshold != null ? (r.free_threshold as { toString(): string }).toString() : null,
    estimatedDays: (r.estimated_days as string | null) ?? null,
    position: r.position as number,
    isActive: r.is_active as boolean,
  }
}

export async function listShippingRatesForZone(zoneId: string): Promise<ShpShippingRate[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "shp_shipping_rates" WHERE "zone_id" = ${zoneId} AND "is_active" = true ORDER BY "position" ASC
  `
  return rows.map(mapRate)
}

export async function listAllShippingRatesForZone(zoneId: string): Promise<ShpShippingRate[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_shipping_rates" WHERE "zone_id" = ${zoneId} ORDER BY "position" ASC`
  return rows.map(mapRate)
}

export async function getShippingRateById(id: string): Promise<ShpShippingRate | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "shp_shipping_rates" WHERE "id" = ${id} LIMIT 1`
  return rows[0] ? mapRate(rows[0]) : null
}

export async function createShippingRate(data: {
  zoneId: string; name: string; type: ShpShippingRate['type']; flatRate?: number | null
  weightRates?: Array<{ upToKg: number; rate: number }> | null; freeThreshold?: number | null; estimatedDays?: string | null
}): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "shp_shipping_rates" ("zone_id", "name", "type", "flat_rate", "weight_rates", "free_threshold", "estimated_days")
    VALUES (${data.zoneId}, ${data.name}, ${data.type}, ${data.flatRate ?? null},
      ${data.weightRates ? JSON.stringify(data.weightRates) : null}::jsonb, ${data.freeThreshold ?? null}, ${data.estimatedDays ?? null})
    RETURNING "id"
  `
  return rows[0]
}

export async function updateShippingRate(id: string, fields: Partial<{
  name: string; type: ShpShippingRate['type']; flatRate: number | null
  weightRates: Array<{ upToKg: number; rate: number }> | null; freeThreshold: number | null
  estimatedDays: string | null; position: number; isActive: boolean
}>): Promise<void> {
  const sets: Prisma.Sql[] = []
  if (fields.name !== undefined) sets.push(Prisma.sql`"name" = ${fields.name}`)
  if (fields.type !== undefined) sets.push(Prisma.sql`"type" = ${fields.type}`)
  if (fields.flatRate !== undefined) sets.push(Prisma.sql`"flat_rate" = ${fields.flatRate}`)
  if (fields.weightRates !== undefined) sets.push(Prisma.sql`"weight_rates" = ${fields.weightRates ? JSON.stringify(fields.weightRates) : null}::jsonb`)
  if (fields.freeThreshold !== undefined) sets.push(Prisma.sql`"free_threshold" = ${fields.freeThreshold}`)
  if (fields.estimatedDays !== undefined) sets.push(Prisma.sql`"estimated_days" = ${fields.estimatedDays}`)
  if (fields.position !== undefined) sets.push(Prisma.sql`"position" = ${fields.position}`)
  if (fields.isActive !== undefined) sets.push(Prisma.sql`"is_active" = ${fields.isActive}`)
  if (sets.length === 0) return
  await prisma.$executeRaw`UPDATE "shp_shipping_rates" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${id}`
}

export async function deleteShippingRate(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "shp_shipping_rates" WHERE "id" = ${id}`
}

// Weight-banded rate resolution: first band whose upToKg >= totalWeightKg.
export function resolveWeightBasedRate(rate: ShpShippingRate, totalWeightKg: number): number | null {
  if (!rate.weightRates) return null
  const sorted = [...rate.weightRates].sort((a, b) => a.upToKg - b.upToKg)
  const band = sorted.find((b) => totalWeightKg <= b.upToKg)
  return band ? band.rate : (sorted[sorted.length - 1]?.rate ?? null)
}
